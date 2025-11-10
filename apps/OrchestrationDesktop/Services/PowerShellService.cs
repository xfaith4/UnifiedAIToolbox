using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Threading;
using System.Threading.Tasks;
using OrchestrationDesktop.Models;

namespace OrchestrationDesktop.Services;

public sealed class PowerShellService : IDisposable
{
    private readonly InitialSessionState _initialSessionState;
    private readonly string _baseDirectory;
    private readonly string _openAiApiKey;
    private bool _disposed;

    public PowerShellService(string baseDirectory, string openAiApiKey)
    {
        if (string.IsNullOrWhiteSpace(baseDirectory))
        {
            throw new ArgumentException("Base directory is required.", nameof(baseDirectory));
        }

        if (string.IsNullOrWhiteSpace(openAiApiKey))
        {
            throw new ArgumentException("OpenAI API key is required.", nameof(openAiApiKey));
        }

        _baseDirectory = baseDirectory;
        _openAiApiKey = openAiApiKey.Trim();
        _initialSessionState = InitialSessionState.CreateDefault();

        var modulePath = Path.Combine(_baseDirectory, "modules", "Orchestration.Common.psm1");
        if (File.Exists(modulePath))
        {
            _initialSessionState.ImportPSModule(new[] { modulePath });
        }
    }

    public Task<bool> ValidateAsync(OrchestrationOptions options, Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        return Task.Run(async () =>
        {
            var allGood = true;

            if (!options.SkipCodex)
            {
                var codexOk = await EnsureCodexAvailableAsync(options, log, cancellationToken);
                if (!codexOk)
                {
                    allGood = false;
                }
            }

            var gitDetected = await InvokeScalarAsync<bool>("Test-OrchCli 'git'", log, cancellationToken);
            if (!gitDetected)
            {
                log(LogLevel.Warning, "Git was not detected on PATH.");
                allGood = false;
            }
            else
            {
                log(LogLevel.Success, "Git detected.");
            }

            if (!Directory.Exists(options.RepoRoot))
            {
                log(LogLevel.Warning, $"Repository path not found: {options.RepoRoot}");
                allGood = false;
            }

            if (!File.Exists(options.GoalFile))
            {
                log(LogLevel.Warning, $"Goal file not found: {options.GoalFile}");
                allGood = false;
            }

            return allGood;
        }, cancellationToken);
    }

    private Task<bool> EnsureCodexAvailableAsync(OrchestrationOptions options, Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        if (options.UseWslForCodex)
        {
            return EnsureCodexViaWslAsync(log, cancellationToken);
        }

        return EnsureCodexOnWindowsAsync(log, cancellationToken);
    }

    private async Task<bool> EnsureCodexOnWindowsAsync(Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        var detected = await InvokeScalarAsync<bool>("Test-OrchCli 'codex'", log, cancellationToken);
        if (!detected)
        {
            log(LogLevel.Warning, "Codex CLI was not detected on PATH.");
            return false;
        }

        log(LogLevel.Success, "Codex CLI detected.");
        return true;
    }

    private async Task<bool> EnsureCodexViaWslAsync(Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        var wslDetected = await InvokeScalarAsync<bool>("Test-OrchCli 'wsl'", log, cancellationToken);
        if (!wslDetected)
        {
            log(LogLevel.Warning, "WSL was not detected on PATH. Install Windows Subsystem for Linux or disable the WSL Codex option.");
            return false;
        }

        const string script = @"
try {
    $null = wsl.exe -e which codex 2>$null
    return $true
}
catch {
    return $false
}";

        var codexDetected = await InvokeScalarAsync<bool>(script, log, cancellationToken);
        if (!codexDetected)
        {
            log(LogLevel.Warning, "Codex CLI was not detected inside the configured WSL environment. Launch WSL and ensure 'codex' is installed.");
            return false;
        }

        log(LogLevel.Success, "Codex CLI detected via WSL.");
        return true;
    }

    public Task RunUnifiedAsync(OrchestrationOptions options, Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        var unifiedScript = Path.Combine(_baseDirectory, "scripts", "Unified-Orchestration.ps1");
        if (!File.Exists(unifiedScript))
        {
            throw new FileNotFoundException("Unified orchestration script not found.", unifiedScript);
        }

        var parameters = new Dictionary<string, object?>
        {
            ["RepoRoot"] = options.RepoRoot,
            ["GoalFile"] = options.GoalFile,
            ["Model"] = options.Model,
            ["ModelInstruction"] = string.IsNullOrWhiteSpace(options.ModelInstruction) ? null : options.ModelInstruction,
            ["PromptId"] = options.PromptId,
            ["CustomPrompt"] = string.IsNullOrWhiteSpace(options.CustomPromptText) ? null : options.CustomPromptText,
            ["AgentId"] = options.AgentId,
            ["AutoSelectAgent"] = options.AutoSelectAgent,
            ["MaxIterations"] = options.MaxIterations,
            ["PassThreshold"] = options.PassThreshold,
            ["SkipContextResolution"] = options.SkipContextResolution ? true : null,
            ["SkipCodex"] = options.SkipCodex ? true : null,
            ["CodexModel"] = options.CodexModel,
            ["CodexInstruction"] = string.IsNullOrWhiteSpace(options.CodexInstruction) ? null : options.CodexInstruction,
            ["UseWslForCodex"] = options.UseWslForCodex ? true : null,
            ["MaxParallel"] = options.MaxParallel,
            ["WorkDir"] = options.WorkDir
        };

        return InvokeScriptAsync(unifiedScript, parameters, log, cancellationToken);
    }

    public Task RunCodexOnlyAsync(OrchestrationOptions options, Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        var script = Path.Combine(_baseDirectory, "codex-multiagent-swarm", "Orchestrate-Codex.ps1");
        if (!File.Exists(script))
        {
            throw new FileNotFoundException("Codex swarm script not found.", script);
        }

        var parameters = new Dictionary<string, object?>
        {
            ["RepoRoot"] = options.RepoRoot,
            ["Model"] = options.CodexModel,
            ["MaxParallel"] = options.MaxParallel,
            ["WorkDir"] = options.WorkDir,
            ["Instruction"] = string.IsNullOrWhiteSpace(options.CodexInstruction) ? null : options.CodexInstruction,
            ["UseWsl"] = options.UseWslForCodex ? true : null
        };

        return InvokeScriptAsync(script, parameters, log, cancellationToken);
    }

    private async Task InvokeScriptAsync(string scriptPath, IDictionary<string, object?> parameters, Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        using var runspace = RunspaceFactory.CreateRunspace(_initialSessionState);
        runspace.Open();
        ApplyEnvironmentOverrides(runspace);

        using var ps = System.Management.Automation.PowerShell.Create();
        ps.Runspace = runspace;

        RegisterStreamHandlers(ps, log);

        var command = new Command(scriptPath, isScript: true);
        ps.Commands.AddCommand(command);

        foreach (var kvp in parameters.Where(kvp => kvp.Value is not null))
        {
            ps.AddParameter(kvp.Key, kvp.Value);
        }

        using var registration = cancellationToken.Register(() =>
        {
            try
            {
                if (ps.InvocationStateInfo.State is not PSInvocationState.Stopping and not PSInvocationState.Stopped)
                {
                    ps.Stop();
                }
            }
            catch (Exception ex)
            {
                log(LogLevel.Warning, $"Cancellation requested but PowerShell stop failed: {ex.Message}");
            }
        });

        await Task.Run(() => ps.Invoke(), cancellationToken).ConfigureAwait(false);
        FlushStreams(ps, log);
    }

    private async Task<T> InvokeScalarAsync<T>(string script, Action<LogLevel, string> log, CancellationToken cancellationToken)
    {
        using var runspace = RunspaceFactory.CreateRunspace(_initialSessionState);
        runspace.Open();
        ApplyEnvironmentOverrides(runspace);

        using var ps = System.Management.Automation.PowerShell.Create();
        ps.Runspace = runspace;
        RegisterStreamHandlers(ps, log);
        ps.AddScript(script);
        using var registration = cancellationToken.Register(() =>
        {
            try
            {
                if (ps.InvocationStateInfo.State is not PSInvocationState.Stopping and not PSInvocationState.Stopped)
                {
                    ps.Stop();
                }
            }
            catch (Exception ex)
            {
                log(LogLevel.Warning, $"Cancellation during validation failed: {ex.Message}");
            }
        });

        var results = await Task.Run(() => ps.Invoke(), cancellationToken).ConfigureAwait(false);
        FlushStreams(ps, log);

        var last = results.LastOrDefault();
        if (last is null)
        {
            return default!;
        }

        var baseObject = last.BaseObject;
        if (baseObject is null)
        {
            return default!;
        }

        return (T)System.Management.Automation.LanguagePrimitives.ConvertTo(baseObject, typeof(T));
    }

    private void ApplyEnvironmentOverrides(Runspace runspace)
    {
        try
        {
            runspace.SessionStateProxy.SetVariable("env:OPENAI_API_KEY", _openAiApiKey);
        }
        catch (Exception ex)
        {
            // Ensure we surface failures when we cannot set the key for the invoked script.
            throw new InvalidOperationException("Failed to propagate the OpenAI API key to the orchestration runspace.", ex);
        }
    }

    private static void RegisterStreamHandlers(System.Management.Automation.PowerShell ps, Action<LogLevel, string> log)
    {
        ps.Streams.Error.DataAdded += (_, args) =>
        {
            if (ps.Streams.Error.Count > args.Index)
            {
                var record = ps.Streams.Error[args.Index];
                log(LogLevel.Error, record.ToString());
            }
        };
        ps.Streams.Warning.DataAdded += (_, args) =>
        {
            if (ps.Streams.Warning.Count > args.Index)
            {
                var record = ps.Streams.Warning[args.Index];
                log(LogLevel.Warning, record.Message);
            }
        };
        ps.Streams.Information.DataAdded += (_, args) =>
        {
            if (ps.Streams.Information.Count > args.Index)
            {
                var record = ps.Streams.Information[args.Index];
                log(LogLevel.Info, record.MessageData?.ToString() ?? string.Empty);
            }
        };
        ps.Streams.Verbose.DataAdded += (_, args) =>
        {
            if (ps.Streams.Verbose.Count > args.Index)
            {
                var record = ps.Streams.Verbose[args.Index];
                log(LogLevel.Info, record.Message);
            }
        };
        ps.Streams.Debug.DataAdded += (_, args) =>
        {
            if (ps.Streams.Debug.Count > args.Index)
            {
                var record = ps.Streams.Debug[args.Index];
                log(LogLevel.Info, record.Message);
            }
        };
    }

    private static void FlushStreams(System.Management.Automation.PowerShell ps, Action<LogLevel, string> log)
    {
        foreach (var record in ps.Streams.Error)
        {
            log(LogLevel.Error, record.ToString());
        }

        foreach (var record in ps.Streams.Warning)
        {
            log(LogLevel.Warning, record.Message);
        }

        foreach (var record in ps.Streams.Information)
        {
            log(LogLevel.Info, record.MessageData?.ToString() ?? string.Empty);
        }
    }

    public void Dispose()
    {
        if (_disposed) { return; }
        _disposed = true;
    }
}

public sealed record OrchestrationOptions(
    string RepoRoot,
    string GoalFile,
    string Model,
    string ModelInstruction,
    string? PromptId,
    string CustomPromptText,
    string? AgentId,
    bool AutoSelectAgent,
    int MaxIterations,
    int PassThreshold,
    bool SkipContextResolution,
    bool SkipCodex,
    string CodexModel,
    string CodexInstruction,
    bool UseWslForCodex,
    int MaxParallel,
    string WorkDir);
