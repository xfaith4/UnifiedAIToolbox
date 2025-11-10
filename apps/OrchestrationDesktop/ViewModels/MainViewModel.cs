using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Management.Automation;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Input;
using OrchestrationDesktop.Infrastructure;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.Services;
using Application = System.Windows.Application;

namespace OrchestrationDesktop.ViewModels;

public sealed class MainViewModel : INotifyPropertyChanged
{
    private readonly PowerShellService _powerShellService;
    private readonly SettingsService _settingsService;
    private CancellationTokenSource? _runCts;
    private string _repoRoot;
    private string _goalFile;
    private string _model = "gpt-5";
    private string _modelInstruction = string.Empty;
    private string _selectedPromptId = string.Empty;
    private string _customPromptText = string.Empty;
    private string _selectedAgentId = string.Empty;
    private bool _autoSelectAgent = true;
    private int _maxIterations = 3;
    private int _passThreshold = 7;
    private bool _skipContextResolution;
    private bool _skipCodex;
    private string _codexModel = "gpt-5-codex";
    private string _codexInstruction = string.Empty;
    private bool _useWslForCodex;
    private int _maxParallel = 3;
    private string _workDir = ".codex_out";
    private bool _isRunning;
    private bool _isProgressIndeterminate;
    private double _progressValue;
    private string _statusMessage = "Ready.";
    private readonly StringBuilder _markdownLog = new();
    private string _logMarkdown = string.Empty;
    private FlowDocument _logDocument = MarkdownRenderer.Render(string.Empty);

    private static readonly Regex TokensPattern = new(@"Tokens used:\s*(\d+)", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly IReadOnlyDictionary<string, ModelPricing> PricingTable =
        new Dictionary<string, ModelPricing>(StringComparer.OrdinalIgnoreCase)
        {
            ["gpt-5"] = new ModelPricing(0.01m, 0.03m),
            ["gpt-4o"] = new ModelPricing(0.005m, 0.015m),
            ["gpt-4o-mini"] = new ModelPricing(0.00015m, 0.0006m),
            ["gpt-5-codex"] = new ModelPricing(0.01m, 0.03m)
        };

    private const string DefaultPricingModel = "gpt-4o-mini";
    private static readonly ModelPricing DefaultPricing = new(0.00015m, 0.0006m);

    public MainViewModel(PowerShellService powerShellService, SettingsService settingsService, string repoRoot)
    {
        _powerShellService = powerShellService ?? throw new ArgumentNullException(nameof(powerShellService));
        _settingsService = settingsService ?? throw new ArgumentNullException(nameof(settingsService));

        var defaults = _settingsService.Load();

        _repoRoot = string.IsNullOrWhiteSpace(defaults.RepoRoot) ? repoRoot : defaults.RepoRoot!;

        if (string.IsNullOrWhiteSpace(defaults.GoalFile))
        {
            _goalFile = Path.Combine(_repoRoot, "Goals", "CurrentGoal.txt");
        }
        else
        {
        _goalFile = defaults.GoalFile;
    }

    _model = defaults.Model;
    _modelInstruction = defaults.ModelInstruction ?? string.Empty;
    _selectedPromptId = defaults.PromptId ?? string.Empty;
    _customPromptText = defaults.CustomPromptText ?? string.Empty;
    _selectedAgentId = defaults.AgentId ?? string.Empty;
    _autoSelectAgent = defaults.AutoSelectAgent;
        _maxIterations = defaults.MaxIterations;
        _passThreshold = defaults.PassThreshold;
        _skipContextResolution = defaults.SkipContextResolution;
        _skipCodex = defaults.SkipCodex;
        _codexModel = defaults.CodexModel;
        _codexInstruction = defaults.CodexInstruction ?? string.Empty;
        _useWslForCodex = defaults.UseWslForCodex;
        _maxParallel = defaults.MaxParallel;
        _workDir = defaults.WorkDir;

        BrowseRepoCommand = new RelayCommand(BrowseRepo);
        BrowseGoalCommand = new RelayCommand(BrowseGoal);
        OpenDashboardCommand = new RelayCommand(OpenDashboard);
        ValidateCommand = new RelayCommand(async () => await ValidateAsync(), () => !IsRunning);
        RunUnifiedCommand = new RelayCommand(async () => await RunUnifiedAsync(), () => !IsRunning);
        RunCodexCommand = new RelayCommand(async () => await RunCodexAsync(), () => !IsRunning);
        CancelCommand = new RelayCommand(CancelRun, () => IsRunning);
    }

    public ObservableCollection<LogEntry> Logs { get; } = new();

    public string LogMarkdown
    {
        get => _logMarkdown;
        private set => SetProperty(ref _logMarkdown, value);
    }

    public FlowDocument LogDocument
    {
        get => _logDocument;
        private set => SetProperty(ref _logDocument, value);
    }

    public string RepoRoot
    {
        get => _repoRoot;
        set => SetProperty(ref _repoRoot, value);
    }

    public string GoalFile
    {
        get => _goalFile;
        set => SetProperty(ref _goalFile, value);
    }

    public string Model
    {
        get => _model;
        set => SetProperty(ref _model, value);
    }

    public string ModelInstruction
    {
        get => _modelInstruction;
        set => SetProperty(ref _modelInstruction, value);
    }

    public string SelectedPromptId
    {
        get => _selectedPromptId;
        set => SetProperty(ref _selectedPromptId, value);
    }

    public string CustomPromptText
    {
        get => _customPromptText;
        set => SetProperty(ref _customPromptText, value);
    }

    public string SelectedAgentId
    {
        get => _selectedAgentId;
        set => SetProperty(ref _selectedAgentId, value);
    }

    public bool AutoSelectAgent
    {
        get => _autoSelectAgent;
        set
        {
            if (SetProperty(ref _autoSelectAgent, value))
            {
                OnPropertyChanged(nameof(CanEditAgentId));
            }
        }
    }

    public bool CanEditAgentId => !AutoSelectAgent;

    public int MaxIterations
    {
        get => _maxIterations;
        set => SetProperty(ref _maxIterations, value);
    }

    public int PassThreshold
    {
        get => _passThreshold;
        set => SetProperty(ref _passThreshold, value);
    }

    public bool SkipContextResolution
    {
        get => _skipContextResolution;
        set => SetProperty(ref _skipContextResolution, value);
    }

    public bool SkipCodex
    {
        get => _skipCodex;
        set => SetProperty(ref _skipCodex, value);
    }

    public string CodexModel
    {
        get => _codexModel;
        set => SetProperty(ref _codexModel, value);
    }

    public string CodexInstruction
    {
        get => _codexInstruction;
        set => SetProperty(ref _codexInstruction, value);
    }

    public bool UseWslForCodex
    {
        get => _useWslForCodex;
        set => SetProperty(ref _useWslForCodex, value);
    }

    public int MaxParallel
    {
        get => _maxParallel;
        set => SetProperty(ref _maxParallel, value);
    }

    public string WorkDir
    {
        get => _workDir;
        set => SetProperty(ref _workDir, value);
    }

    public bool IsRunning
    {
        get => _isRunning;
        private set
        {
            if (SetProperty(ref _isRunning, value))
            {
                RaiseCommandStates();
                OnPropertyChanged(nameof(CanRunUnified));
                OnPropertyChanged(nameof(CanRunCodex));
            }
        }
    }

    public bool IsProgressIndeterminate
    {
        get => _isProgressIndeterminate;
        private set => SetProperty(ref _isProgressIndeterminate, value);
    }

    public double ProgressValue
    {
        get => _progressValue;
        private set => SetProperty(ref _progressValue, value);
    }

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetProperty(ref _statusMessage, value);
    }

    public bool CanRunUnified => !IsRunning;
    public bool CanRunCodex => !IsRunning;

    public ICommand BrowseRepoCommand { get; }
    public ICommand BrowseGoalCommand { get; }
    public RelayCommand OpenDashboardCommand { get; }
    public RelayCommand ValidateCommand { get; }
    public RelayCommand RunUnifiedCommand { get; }
    public RelayCommand RunCodexCommand { get; }
    public RelayCommand CancelCommand { get; }

    public event PropertyChangedEventHandler? PropertyChanged;

    private async Task ValidateAsync()
    {
        ClearLogs();
        StatusMessage = "Validating environment…";
        IsProgressIndeterminate = true;
        IsRunning = true;
        _runCts = new CancellationTokenSource();

        try
        {
            var options = BuildOptions();
            var ok = await _powerShellService.ValidateAsync(options, AddLog, _runCts.Token);
            StatusMessage = ok ? "Validation successful." : "Validation completed with warnings.";
            AddLog(ok ? LogLevel.Success : LogLevel.Warning, StatusMessage);
        }
        catch (Exception ex)
        {
            StatusMessage = "Validation failed.";
            AddLog(LogLevel.Error, ex.Message);
        }
        finally
        {
            _runCts.Dispose();
            _runCts = null;
            IsProgressIndeterminate = false;
            IsRunning = false;
            SaveSettings();
        }
    }

    private async Task RunUnifiedAsync()
    {
        await RunPipelineAsync(async ct =>
        {
            StatusMessage = "Running unified orchestration…";
            var runStartedUtc = DateTime.UtcNow;
            var options = BuildOptions();
            await _powerShellService.RunUnifiedAsync(options, AddLog, ct);
            await PublishCostSummaryAsync(options, runStartedUtc);
            StatusMessage = "Unified orchestration complete.";
            AddLog(LogLevel.Success, StatusMessage);
        });
    }

    private async Task RunCodexAsync()
    {
        await RunPipelineAsync(async ct =>
        {
            StatusMessage = "Running Codex swarm…";
            var runStartedUtc = DateTime.UtcNow;
            var options = BuildOptions();
            await _powerShellService.RunCodexOnlyAsync(options, AddLog, ct);
            await PublishSwarmInsightsAsync(options);
            await PublishCostSummaryAsync(options, runStartedUtc);
            StatusMessage = "Codex swarm complete.";
            AddLog(LogLevel.Success, StatusMessage);
        });
    }

    private async Task RunPipelineAsync(Func<CancellationToken, Task> pipeline)
    {
        if (IsRunning) { return; }

        ClearLogs();
        IsRunning = true;
        IsProgressIndeterminate = true;
        ProgressValue = 0;
        _runCts = new CancellationTokenSource();

        try
        {
            await pipeline(_runCts.Token);
        }
        catch (PipelineStoppedException)
        {
            StatusMessage = "Pipeline cancelled.";
            AddLog(LogLevel.Warning, StatusMessage);
        }
        catch (Exception ex)
        {
            StatusMessage = "Orchestration failed.";
            AddLog(LogLevel.Error, ex.Message);
        }
        finally
        {
            _runCts?.Dispose();
            _runCts = null;
            IsProgressIndeterminate = false;
            IsRunning = false;
            ProgressValue = 0;
            SaveSettings();
        }
    }

    private async Task PublishSwarmInsightsAsync(OrchestrationOptions options)
    {
        try
        {
            var insights = await Task.Run(() => GatherSwarmInsights(options));
            if (insights is null)
            {
                return;
            }

            var patchSummary = insights.PatchCount == 1 ? "1 patch" : $"{insights.PatchCount} patches";
            var agentSummary = insights.AgentCount == 1 ? "1 agent task" : $"{insights.AgentCount} agent tasks";
            var mergedSize = insights.MergedPatchBytes > 0 ? $", merged patch {(insights.MergedPatchBytes / 1024d):F1} KB" : string.Empty;
            AddLog(LogLevel.Info, $"[Swarm] Completed {agentSummary}, generated {patchSummary}{mergedSize}.");

            if (!string.IsNullOrWhiteSpace(insights.FindingsSnippet))
            {
                AddLog(LogLevel.Info, "[Swarm] Findings preview:\n" + insights.FindingsSnippet);
            }

            if (!string.IsNullOrWhiteSpace(insights.FinalSynthesisSnippet))
            {
                AddLog(LogLevel.Info, "[Swarm] Latest synthesis excerpt:\n" + insights.FinalSynthesisSnippet);
            }

            foreach (var sample in insights.AgentSnippets)
            {
                AddLog(LogLevel.Info, "[Swarm] " + sample);
            }
        }
        catch (Exception ex)
        {
            AddLog(LogLevel.Warning, $"[Swarm] Unable to summarize artifacts: {ex.Message}");
        }
    }

    private async Task PublishCostSummaryAsync(OrchestrationOptions options, DateTime runStartedUtc)
    {
        if (options is null)
        {
            return;
        }

        try
        {
            var summary = await Task.Run(() => BuildCostSummary(options, runStartedUtc));
            if (summary is null || summary.Entries.Count == 0)
            {
                return;
            }

            var builder = new StringBuilder();
            builder.AppendLine("### Cost Estimate");
            builder.AppendLine();

            foreach (var entry in summary.Entries)
            {
                if (entry.EstimatedCost.HasValue)
                {
                    var tokenDisplay = entry.TotalTokens.ToString("N0", CultureInfo.InvariantCulture);
                    var costDisplay = entry.EstimatedCost.Value.ToString("F4", CultureInfo.InvariantCulture);
                    builder.AppendLine($"- `{entry.Model}` • {tokenDisplay} tokens → **${costDisplay}**");
                }
                else
                {
                    var tokenDisplay = entry.TotalTokens.ToString("N0", CultureInfo.InvariantCulture);
                    builder.AppendLine($"- `{entry.Model}` • {tokenDisplay} tokens → _(rate unavailable)_");
                }

                if (!string.IsNullOrWhiteSpace(entry.Note))
                {
                    builder.AppendLine($"  - {entry.Note}");
                }
            }

            if (summary.TotalCost.HasValue)
            {
                var totalDisplay = summary.TotalCost.Value.ToString("F4", CultureInfo.InvariantCulture);
                builder.AppendLine();
                builder.AppendLine($"**Estimated Total:** ${totalDisplay}");
            }

            if (!string.IsNullOrWhiteSpace(summary.Source))
            {
                builder.AppendLine();
                builder.AppendLine($"_Source: {summary.Source}_");
            }

            AddLog(LogLevel.Info, builder.ToString().TrimEnd());
        }
        catch (Exception ex)
        {
            AddLog(LogLevel.Warning, $"Cost estimate unavailable: {ex.Message}");
        }
    }

    private static SwarmInsights? GatherSwarmInsights(OrchestrationOptions options)
    {
        if (options is null)
        {
            return null;
        }

        var workDir = options.WorkDir;
        if (string.IsNullOrWhiteSpace(workDir) || !Directory.Exists(workDir))
        {
            return null;
        }

        var agentDirs = Directory.EnumerateDirectories(workDir, "*_*", SearchOption.TopDirectoryOnly).ToList();
        var patchCount = Directory.EnumerateFiles(workDir, "patch.diff", SearchOption.AllDirectories).Count();

        string? findingsSnippet = null;
        var findingsPath = Path.Combine(workDir, "synth", "Findings.md");
        if (File.Exists(findingsPath))
        {
            findingsSnippet = ReadSnippet(findingsPath, 6, 600);
        }

        string? finalSnippet = null;
        var runsDir = Path.Combine(options.RepoRoot, "runs");
        if (Directory.Exists(runsDir))
        {
            string? latestRun = null;
            try
            {
                latestRun = Directory.EnumerateDirectories(runsDir)
                    .OrderByDescending(d => Directory.GetCreationTime(d))
                    .FirstOrDefault();
            }
            catch
            {
                latestRun = Directory.EnumerateDirectories(runsDir)
                    .OrderByDescending(Path.GetFileName)
                    .FirstOrDefault();
            }

            if (latestRun is not null)
            {
                var finalPath = Path.Combine(latestRun, "Final_Synthesis.txt");
                if (File.Exists(finalPath))
                {
                    finalSnippet = ReadSnippet(finalPath, 6, 700);
                }
            }
        }

        var agentSnippets = new List<string>();
        foreach (var dir in agentDirs)
        {
            var logPath = Path.Combine(dir, "codex.log");
            if (!File.Exists(logPath))
            {
                continue;
            }

            try
            {
                var lines = File.ReadLines(logPath)
                    .Where(line => !string.IsNullOrWhiteSpace(line))
                    .Take(3)
                    .Select(NormalizeWhitespace)
                    .ToList();

                if (lines.Count > 0)
                {
                    agentSnippets.Add($"{Path.GetFileName(dir)} › {string.Join(" | ", lines)}");
                }
            }
            catch
            {
                // ignore individual log read issues
            }
        }

        if (agentSnippets.Count > 3)
        {
            agentSnippets = agentSnippets.Take(3).ToList();
        }

        var mergedPatchPath = Path.Combine(workDir, "synth", "merged.patch");
        var mergedPatchBytes = File.Exists(mergedPatchPath) ? new FileInfo(mergedPatchPath).Length : 0;

        if (agentDirs.Count == 0 && patchCount == 0 && string.IsNullOrWhiteSpace(findingsSnippet) &&
            string.IsNullOrWhiteSpace(finalSnippet) && agentSnippets.Count == 0 && mergedPatchBytes == 0)
        {
            return null;
        }

        return new SwarmInsights(
            agentDirs.Count,
            patchCount,
            mergedPatchBytes,
            findingsSnippet,
            finalSnippet,
            agentSnippets);
    }

    private static CostSummary? BuildCostSummary(OrchestrationOptions options, DateTime runStartedUtc)
    {
        if (options is null)
        {
            return null;
        }

        var runsDir = Path.Combine(options.RepoRoot, "runs");
        if (!Directory.Exists(runsDir))
        {
            return null;
        }

        var candidate = Directory.EnumerateDirectories(runsDir)
            .Select(path => new DirectoryInfo(path))
            .Where(dir => dir.LastWriteTimeUtc >= runStartedUtc)
            .OrderByDescending(dir => dir.LastWriteTimeUtc)
            .FirstOrDefault();

        if (candidate is null)
        {
            return null;
        }

        var entries = new List<CostEntry>();
        var apiLog = Path.Combine(candidate.FullName, "API.txt");
        if (!File.Exists(apiLog))
        {
            entries.Add(new CostEntry(options.Model, 0, null, "No API token log found for the latest run."));
            return new CostSummary(entries, null, candidate.FullName);
        }

        var totalTokens = SumTokens(apiLog, out var sampleCount);
        if (totalTokens <= 0)
        {
            entries.Add(new CostEntry(options.Model, 0, null, "Token usage not detected in API log."));
            return new CostSummary(entries, null, candidate.FullName);
        }

        var milestoneEntry = CreateCostEntry(options.Model, totalTokens, sampleCount);
        entries.Add(milestoneEntry);

        var totalCost = milestoneEntry.EstimatedCost;
        return new CostSummary(entries, totalCost, candidate.FullName);
    }

    private static int SumTokens(string apiLogPath, out int sampleCount)
    {
        var total = 0;
        var count = 0;

        foreach (var line in File.ReadLines(apiLogPath))
        {
            var match = TokensPattern.Match(line);
            if (!match.Success)
            {
                continue;
            }

            if (int.TryParse(match.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var tokens))
            {
                total += tokens;
                count++;
            }
        }

        sampleCount = count;
        return total;
    }

    private static CostEntry CreateCostEntry(string model, int tokens, int sampleCount)
    {
        var notes = new List<string>();
        if (sampleCount > 0)
        {
            notes.Add(sampleCount == 1
                ? "1 OpenAI call recorded."
                : $"{sampleCount} OpenAI calls recorded.");
        }

        if (!PricingTable.TryGetValue(model, out var pricing))
        {
            pricing = DefaultPricing;
            notes.Add($"Using {DefaultPricingModel} pricing fallback for `{model}`.");
        }

        var effectiveRate = pricing.InputPerThousand + pricing.OutputPerThousand;
        var estimated = decimal.Round(tokens / 1000m * effectiveRate, 4, MidpointRounding.AwayFromZero);
        var note = notes.Count > 0 ? string.Join(' ', notes) : null;

        return new CostEntry(model, tokens, estimated, note);
    }

    private static string ReadSnippet(string path, int maxLines, int maxChars)
    {
        try
        {
            var lines = File.ReadLines(path)
                .Where(line => !string.IsNullOrWhiteSpace(line))
                .Take(maxLines)
                .ToList();

            if (lines.Count == 0)
            {
                return string.Empty;
            }

            var text = string.Join(Environment.NewLine, lines).Trim();
            if (text.Length > maxChars)
            {
                text = text.Substring(0, maxChars) + "…";
            }
            return text;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string NormalizeWhitespace(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var parts = value.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts);
    }

    private sealed record SwarmInsights(
        int AgentCount,
        int PatchCount,
        long MergedPatchBytes,
        string? FindingsSnippet,
        string? FinalSynthesisSnippet,
        IReadOnlyList<string> AgentSnippets);
    private sealed record ModelPricing(decimal InputPerThousand, decimal OutputPerThousand);
    private sealed record CostEntry(string Model, int TotalTokens, decimal? EstimatedCost, string? Note);
    private sealed record CostSummary(IReadOnlyList<CostEntry> Entries, decimal? TotalCost, string? Source);

    private static class MarkdownRenderer
    {
        private static readonly Thickness ParagraphSpacing = new(0, 0, 0, 8);
        private static readonly FontFamily BodyFont = new("Consolas");
        private static readonly FontFamily CodeFont = new("Consolas");
        private static readonly SolidColorBrush CodeBackground = new(Color.FromRgb(230, 234, 240));
        private static readonly SolidColorBrush SeparatorBrush = new(Color.FromRgb(200, 206, 220));

        public static FlowDocument Render(string markdown)
        {
            var document = CreateDocument();
            if (string.IsNullOrWhiteSpace(markdown))
            {
                return document;
            }

            var lines = markdown.Replace("\r\n", "\n").Split('\n');
            List? currentList = null;

            foreach (var raw in lines)
            {
                var line = raw.TrimEnd();

                if (string.IsNullOrWhiteSpace(line))
                {
                    currentList = null;
                    continue;
                }

                if (line == "---")
                {
                    currentList = null;
                    document.Blocks.Add(CreateSeparator());
                    continue;
                }

                if (line.StartsWith("### ", StringComparison.Ordinal))
                {
                    currentList = null;
                    document.Blocks.Add(CreateHeading(line.Substring(4)));
                    continue;
                }

                if (line.StartsWith("- ", StringComparison.Ordinal))
                {
                    if (currentList is null)
                    {
                        currentList = CreateList();
                        document.Blocks.Add(currentList);
                    }

                    var content = line.Substring(2).Trim();
                    var listItem = new ListItem(CreateParagraph(content, isListItem: true));
                    currentList.ListItems.Add(listItem);
                    continue;
                }

                if (line.StartsWith("  - ", StringComparison.Ordinal))
                {
                    currentList = null;
                    document.Blocks.Add(CreateIndentedNote(line.Substring(4).Trim()));
                    continue;
                }

                currentList = null;
                document.Blocks.Add(CreateParagraph(line));
            }

            return document;
        }

        private static FlowDocument CreateDocument()
        {
            return new FlowDocument
            {
                FontFamily = BodyFont,
                FontSize = 13,
                PagePadding = new Thickness(4),
                ColumnWidth = double.PositiveInfinity
            };
        }

        private static Paragraph CreateHeading(string text)
        {
            var paragraph = new Paragraph
            {
                FontWeight = FontWeights.Bold,
                FontSize = 16,
                Margin = new Thickness(0, 12, 0, 6)
            };

            AppendInlines(paragraph, text);
            return paragraph;
        }

        private static Paragraph CreateParagraph(string text, bool isListItem = false)
        {
            var paragraph = new Paragraph
            {
                Margin = isListItem ? new Thickness(0) : ParagraphSpacing
            };

            AppendInlines(paragraph, text);
            return paragraph;
        }

        private static Paragraph CreateIndentedNote(string text)
        {
            var paragraph = new Paragraph
            {
                Margin = new Thickness(24, 0, 0, 6)
            };

            paragraph.Inlines.Add(new Run("• ")
            {
                Foreground = Brushes.Gray
            });

            AppendInlines(paragraph, text);
            return paragraph;
        }

        private static List CreateList()
        {
            return new List
            {
                Margin = new Thickness(12, 0, 0, 8),
                MarkerStyle = TextMarkerStyle.Disc
            };
        }

        private static Block CreateSeparator()
        {
            var border = new Border
            {
                BorderBrush = SeparatorBrush,
                BorderThickness = new Thickness(0, 1, 0, 0),
                Margin = new Thickness(0, 8, 0, 8)
            };

            return new BlockUIContainer(border);
        }

        private static void AppendInlines(Paragraph paragraph, string text)
        {
            foreach (var inline in ParseInlines(text))
            {
                paragraph.Inlines.Add(inline);
            }
        }

        private static IEnumerable<Inline> ParseInlines(string text)
        {
            if (string.IsNullOrEmpty(text))
            {
                yield break;
            }

            var length = text.Length;
            var index = 0;

            while (index < length)
            {
                if (index + 1 < length && text[index] == '*' && text[index + 1] == '*')
                {
                    var end = text.IndexOf("**", index + 2, StringComparison.Ordinal);
                    if (end >= 0)
                    {
                        var content = text.Substring(index + 2, end - (index + 2));
                        if (content.Length > 0)
                        {
                            var bold = new Bold();
                            foreach (var inline in ParseInlines(content))
                            {
                                bold.Inlines.Add(inline);
                            }
                            yield return bold;
                        }
                        index = end + 2;
                        continue;
                    }
                }

                if (text[index] == '_' )
                {
                    var end = text.IndexOf('_', index + 1);
                    if (end > index)
                    {
                        var content = text.Substring(index + 1, end - index - 1);
                        if (content.Length > 0)
                        {
                            yield return new Italic(new Run(content));
                        }
                        index = end + 1;
                        continue;
                    }
                }

                if (text[index] == '`')
                {
                    var end = text.IndexOf('`', index + 1);
                    if (end > index)
                    {
                        var content = text.Substring(index + 1, end - index - 1);
                        yield return new Run(content)
                        {
                            FontFamily = CodeFont,
                            Background = CodeBackground,
                            Foreground = Brushes.DarkSlateGray
                        };
                        index = end + 1;
                        continue;
                    }
                }

                var next = FindNextMarker(text, index);
                if (next < 0)
                {
                    yield return new Run(text.Substring(index));
                    break;
                }

                if (next == index)
                {
                    next = index + 1;
                }

                var segment = text.Substring(index, next - index);
                if (segment.Length > 0)
                {
                    yield return new Run(segment);
                }
                index = next;
            }
        }

        private static int FindNextMarker(string text, int startIndex)
        {
            var nextDouble = text.IndexOf("**", startIndex, StringComparison.Ordinal);
            var nextUnderscore = text.IndexOf('_', startIndex);
            var nextBacktick = text.IndexOf('`', startIndex);

            var candidates = new[] { nextDouble, nextUnderscore, nextBacktick }
                .Where(i => i >= 0)
                .DefaultIfEmpty(-1);

            var min = int.MaxValue;
            foreach (var candidate in candidates)
            {
                if (candidate >= 0 && candidate < min)
                {
                    min = candidate;
                }
            }

            return min == int.MaxValue ? -1 : min;
        }
    }

    private void CancelRun()
    {
        if (_runCts is null || !_isRunning)
        {
            return;
        }

        _runCts.Cancel();
        AddLog(LogLevel.Warning, "Cancellation requested.");
    }

    private void OpenDashboard()
    {
        try
        {
            var repoPath = RepoRoot;
            if (!Path.IsPathRooted(repoPath))
            {
                repoPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, repoPath));
            }

            var candidates = new[]
            {
                Path.Combine(repoPath, "MilestoneDashboard", "index.html"),
                Path.Combine(repoPath, "MilestoneDashboard", "dist", "index.html"),
                Path.Combine(repoPath, "MilestoneDashboard.html")
            };

            var target = candidates.FirstOrDefault(File.Exists);
            if (target is null)
            {
                AddLog(LogLevel.Warning, "Milestone dashboard not found. Build the dashboard or update the path in settings.");
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = target,
                UseShellExecute = true
            });

            AddLog(LogLevel.Info, $"Opening milestone dashboard: {target}");
        }
        catch (Exception ex)
        {
            AddLog(LogLevel.Error, $"Failed to open milestone dashboard: {ex.Message}");
        }
    }

    private void BrowseRepo()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Select the repository root."
        };

        if (Directory.Exists(RepoRoot))
        {
            dialog.SelectedPath = RepoRoot;
        }

        if (dialog.ShowDialog() == DialogResult.OK)
        {
            RepoRoot = dialog.SelectedPath;
            if (!File.Exists(GoalFile))
            {
                var defaultGoal = Path.Combine(RepoRoot, "Goals", "CurrentGoal.txt");
                if (File.Exists(defaultGoal))
                {
                    GoalFile = defaultGoal;
                }
            }
            SaveSettings();
        }
    }

    private void BrowseGoal()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Text files (*.txt)|*.txt|All files (*.*)|*.*",
            FileName = GoalFile,
            CheckFileExists = true
        };

        if (dialog.ShowDialog() == true)
        {
            GoalFile = dialog.FileName;
            SaveSettings();
        }
    }

    private OrchestrationOptions BuildOptions()
    {
        var repoPath = RepoRoot;
        if (!Path.IsPathRooted(repoPath))
        {
            repoPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, repoPath));
        }

        var goal = GoalFile;
        if (!Path.IsPathRooted(goal))
        {
            goal = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, goal));
        }

        var workDir = WorkDir;
        if (!Path.IsPathRooted(workDir))
        {
            workDir = Path.Combine(repoPath, workDir);
        }

        return new OrchestrationOptions(
            repoPath,
            goal,
            Model,
            ModelInstruction,
            string.IsNullOrWhiteSpace(SelectedPromptId) ? null : SelectedPromptId,
            CustomPromptText,
            string.IsNullOrWhiteSpace(SelectedAgentId) ? null : SelectedAgentId,
            AutoSelectAgent,
            MaxIterations,
            PassThreshold,
            SkipContextResolution,
            SkipCodex,
            CodexModel,
            CodexInstruction,
            UseWslForCodex,
            MaxParallel,
            workDir);
    }

    private void SaveSettings()
    {
        var snapshot = new UserSettings
        {
            RepoRoot = RepoRoot,
            GoalFile = GoalFile,
            Model = Model,
            ModelInstruction = ModelInstruction,
            PromptId = string.IsNullOrWhiteSpace(SelectedPromptId) ? null : SelectedPromptId,
            CustomPromptText = CustomPromptText ?? string.Empty,
            AgentId = string.IsNullOrWhiteSpace(SelectedAgentId) ? null : SelectedAgentId,
            AutoSelectAgent = AutoSelectAgent,
            MaxIterations = MaxIterations,
            PassThreshold = PassThreshold,
            SkipContextResolution = SkipContextResolution,
            SkipCodex = SkipCodex,
            CodexModel = CodexModel,
            CodexInstruction = CodexInstruction,
            UseWslForCodex = UseWslForCodex,
            MaxParallel = MaxParallel,
            WorkDir = WorkDir
        };

        _settingsService.Save(snapshot);
    }

    private void AddLog(LogLevel level, string message)
    {
        Application.Current.Dispatcher.Invoke(() =>
        {
            Logs.Add(new LogEntry(message, level));
            AppendMarkdown(level, message);
        });
    }

    private void ClearLogs()
    {
        Application.Current.Dispatcher.Invoke(() =>
        {
            Logs.Clear();
            _markdownLog.Clear();
            LogMarkdown = string.Empty;
            LogDocument = MarkdownRenderer.Render(string.Empty);
        });
    }

    private void RaiseCommandStates()
    {
        ValidateCommand.RaiseCanExecuteChanged();
        RunUnifiedCommand.RaiseCanExecuteChanged();
        RunCodexCommand.RaiseCanExecuteChanged();
        CancelCommand.RaiseCanExecuteChanged();
    }

    private bool SetProperty<T>(ref T storage, T value, [CallerMemberName] string? propertyName = null)
    {
        if (Equals(storage, value))
        {
            return false;
        }

        storage = value;
        OnPropertyChanged(propertyName);
        return true;
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    private void AppendMarkdown(LogLevel level, string message)
    {
        var text = (message ?? string.Empty).Replace("\r\n", "\n").TrimEnd();
        var header = level switch
        {
            LogLevel.Success => "Success",
            LogLevel.Warning => "Warning",
            LogLevel.Error => "Error",
            _ => "Info"
        };

        var emoji = level switch
        {
            LogLevel.Success => "✅",
            LogLevel.Warning => "⚠️",
            LogLevel.Error => "❌",
            _ => "ℹ️"
        };

        if (_markdownLog.Length > 0)
        {
            _markdownLog.AppendLine();
            _markdownLog.AppendLine("---");
            _markdownLog.AppendLine();
        }

        _markdownLog.AppendLine($"{emoji} **{header}**");

        if (!string.IsNullOrWhiteSpace(text))
        {
            _markdownLog.AppendLine();
            _markdownLog.AppendLine(text);
        }

        var markdown = _markdownLog.ToString();
        LogMarkdown = markdown;
        LogDocument = MarkdownRenderer.Render(markdown);
    }
}
