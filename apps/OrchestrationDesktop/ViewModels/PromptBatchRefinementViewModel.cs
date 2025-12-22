using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Forms;
using OrchestrationDesktop.Infrastructure;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.Services;

namespace OrchestrationDesktop.ViewModels;

public sealed class PromptBatchRefinementViewModel : INotifyPropertyChanged
{
    private static readonly string[] DefaultIncludePatterns = { "*.prompt.yaml", "*.yaml" };
    private const string DefaultExcludeRegex = "(\\.meta\\.yaml$|\\.tests\\.yaml$)";

    private readonly PowerShellService _powerShellService;
    private readonly string _repoRoot;
    private CancellationTokenSource? _runCts;

    private string _promptRoot;
    private string _mode = "Copy";
    private int _iterations = 3;
    private bool _saveArtifacts = true;
    private bool _isRunning;
    private string _statusMessage = "Ready.";
    private string _summaryPath = string.Empty;
    private string _outRoot = string.Empty;
    private int _processedCount;
    private string _currentFile = string.Empty;

    public PromptBatchRefinementViewModel(PowerShellService powerShellService, string repoRoot)
    {
        _powerShellService = powerShellService ?? throw new ArgumentNullException(nameof(powerShellService));
        _repoRoot = repoRoot ?? throw new ArgumentNullException(nameof(repoRoot));
        _promptRoot = ResolveDefaultPromptRoot(_repoRoot);

        BrowsePromptRootCommand = new RelayCommand(BrowsePromptRoot, () => !IsRunning);
        RunCommand = new RelayCommand(async () => await RunAsync(), () => !IsRunning);
        CancelCommand = new RelayCommand(CancelRun, () => IsRunning);
    }

    public ObservableCollection<PromptBatchRefinementResult> Results { get; } = new();

    public IReadOnlyList<string> Modes { get; } = new[] { "Copy", "InPlace" };

    public string PromptRoot
    {
        get => _promptRoot;
        set => SetProperty(ref _promptRoot, value);
    }

    public string Mode
    {
        get => _mode;
        set => SetProperty(ref _mode, value);
    }

    public int Iterations
    {
        get => _iterations;
        set => SetProperty(ref _iterations, value);
    }

    public bool SaveArtifacts
    {
        get => _saveArtifacts;
        set => SetProperty(ref _saveArtifacts, value);
    }

    public bool IsRunning
    {
        get => _isRunning;
        private set
        {
            if (SetProperty(ref _isRunning, value))
            {
                RaiseCommandStates();
                OnPropertyChanged(nameof(IsProgressIndeterminate));
            }
        }
    }

    public bool IsProgressIndeterminate => IsRunning;

    public string StatusMessage
    {
        get => _statusMessage;
        private set => SetProperty(ref _statusMessage, value);
    }

    public string SummaryPath
    {
        get => _summaryPath;
        private set => SetProperty(ref _summaryPath, value);
    }

    public string OutRoot
    {
        get => _outRoot;
        private set => SetProperty(ref _outRoot, value);
    }

    public int ProcessedCount
    {
        get => _processedCount;
        private set => SetProperty(ref _processedCount, value);
    }

    public string CurrentFile
    {
        get => _currentFile;
        private set => SetProperty(ref _currentFile, value);
    }

    public RelayCommand BrowsePromptRootCommand { get; }
    public RelayCommand RunCommand { get; }
    public RelayCommand CancelCommand { get; }

    public event PropertyChangedEventHandler? PropertyChanged;

    private async Task RunAsync()
    {
        if (IsRunning)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(PromptRoot) || !Directory.Exists(PromptRoot))
        {
            StatusMessage = "Prompt root folder not found.";
            return;
        }

        Results.Clear();
        ProcessedCount = 0;
        CurrentFile = string.Empty;

        OutRoot = BuildOutRoot(_repoRoot);
        SummaryPath = Path.Combine(OutRoot, "summary.json");

        var options = new PromptBatchRefinementOptions(
            PromptRoot,
            Iterations,
            SaveArtifacts,
            Mode,
            OutRoot,
            DefaultIncludePatterns,
            DefaultExcludeRegex);

        IsRunning = true;
        StatusMessage = "Batch refinement running...";
        _runCts = new CancellationTokenSource();

        try
        {
            await _powerShellService.RunPromptBatchRefinementAsync(
                options,
                HandleResult,
                (_, message) => UpdateStatus(message),
                _runCts.Token).ConfigureAwait(false);

            UpdateStatus($"Completed. Summary: {SummaryPath}");
        }
        catch (OperationCanceledException)
        {
            UpdateStatus("Batch refinement canceled.");
        }
        catch (Exception ex)
        {
            UpdateStatus($"Batch refinement failed: {ex.Message}");
        }
        finally
        {
            IsRunning = false;
            _runCts?.Dispose();
            _runCts = null;
        }
    }

    private void HandleResult(PromptBatchRefinementResult result)
    {
        Application.Current.Dispatcher.Invoke(() =>
        {
            Results.Add(result);
            ProcessedCount++;
            CurrentFile = result.File ?? string.Empty;
            StatusMessage = $"Processed {ProcessedCount}: {CurrentFile}";
        });
    }

    private void UpdateStatus(string message)
    {
        Application.Current.Dispatcher.Invoke(() =>
        {
            StatusMessage = message;
        });
    }

    private void CancelRun()
    {
        if (_runCts is null || !IsRunning)
        {
            return;
        }

        _runCts.Cancel();
        StatusMessage = "Cancellation requested...";
    }

    private void BrowsePromptRoot()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Select prompt root folder."
        };

        if (Directory.Exists(PromptRoot))
        {
            dialog.SelectedPath = PromptRoot;
        }

        if (dialog.ShowDialog() == DialogResult.OK)
        {
            PromptRoot = dialog.SelectedPath;
        }
    }

    private void RaiseCommandStates()
    {
        BrowsePromptRootCommand.RaiseCanExecuteChanged();
        RunCommand.RaiseCanExecuteChanged();
        CancelCommand.RaiseCanExecuteChanged();
    }

    private static string ResolveDefaultPromptRoot(string repoRoot)
    {
        var dataPrompts = Path.Combine(repoRoot, "data", "prompts");
        if (Directory.Exists(dataPrompts))
        {
            return dataPrompts;
        }

        var prompts = Path.Combine(repoRoot, "prompts");
        return Directory.Exists(prompts) ? prompts : repoRoot;
    }

    private static string BuildOutRoot(string repoRoot)
    {
        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        return Path.Combine(repoRoot, "artifacts", $"prompt-refine-batch_{stamp}");
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
}
