using System;
using System.IO;
using System.Windows;
using OrchestrationDesktop.Services;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.ViewModels;

namespace OrchestrationDesktop.Views;

public partial class MainWindow : Window
{
    private readonly PowerShellService _powerShellService;
    private readonly SettingsService _settingsService;
    private readonly PromptLibraryService _promptLibraryService;
    private readonly AgentDefinitionService _agentDefinitionService;
    private HelpWindow? _helpWindow;

    private MainViewModel ViewModel => (MainViewModel)DataContext;

    public MainWindow()
    {
        InitializeComponent();

        var repoRoot = LocateRepoRoot();
        var apiKey = App.OpenAiApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("OpenAI API key was not initialized.");
        }

        _powerShellService = new PowerShellService(repoRoot, apiKey);
        _settingsService = new SettingsService("AI-Orchestration");
        _promptLibraryService = new PromptLibraryService(repoRoot);
        _agentDefinitionService = new AgentDefinitionService(repoRoot);
        DataContext = new MainViewModel(_powerShellService, _settingsService, repoRoot);
    }

    protected override void OnClosed(EventArgs e)
    {
        base.OnClosed(e);
        _powerShellService.Dispose();
    }

    private void OnOpenHelp(object sender, RoutedEventArgs e)
    {
        if (_helpWindow is { IsLoaded: true })
        {
            if (_helpWindow.WindowState == WindowState.Minimized)
            {
                _helpWindow.WindowState = WindowState.Normal;
            }

            _helpWindow.Activate();
            return;
        }

        _helpWindow = new HelpWindow
        {
            Owner = this
        };
        _helpWindow.Closed += (_, _) => _helpWindow = null;
        _helpWindow.Show();
    }

    private void OnShowAbout(object sender, RoutedEventArgs e)
    {
        const string about = """
AI Orchestration Desktop coordinates milestone planning, validation, and Codex swarm execution for the AI-Orchestration toolkit.

- Configure repository, goal, and model settings with persisted preferences.
- Validate environment dependencies before orchestration runs.
- Launch unified pipelines or dedicated Codex swarms with custom instructions.

Version 1.0.0
(c) 2025 AI-Orchestration Automation Team
""";
        System.Windows.MessageBox.Show(this, about, "About AI Orchestration Desktop", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void OnSelectMilestoneInstruction(object sender, RoutedEventArgs e)
    {
        var template = PickTemplate();
        if (template is not null)
        {
            ViewModel.ModelInstruction = template.Content;
        }
    }

    private void OnSelectCodexInstruction(object sender, RoutedEventArgs e)
    {
        var template = PickTemplate();
        if (template is not null)
        {
            ViewModel.CodexInstruction = template.Content;
        }
    }

    private void OnSelectPromptTemplate(object sender, RoutedEventArgs e)
    {
        var picker = new PromptPickerWindow(_promptLibraryService)
        {
            Owner = this
        };

        if (picker.ShowDialog() == true && picker.SelectedTemplate is not null)
        {
            ViewModel.SelectedPromptId = picker.SelectedTemplate.Id;
        }
    }

    private void OnClearPromptTemplate(object sender, RoutedEventArgs e)
    {
        ViewModel.SelectedPromptId = string.Empty;
    }

    private void OnSelectAgent(object sender, RoutedEventArgs e)
    {
        var picker = new AgentPickerWindow(_agentDefinitionService)
        {
            Owner = this
        };

        if (picker.ShowDialog() == true && picker.SelectedAgent is not null)
        {
            ViewModel.SelectedAgentId = picker.SelectedAgentId ?? picker.SelectedAgent.Name;
        }
    }

    private void OnClearAgent(object sender, RoutedEventArgs e)
    {
        ViewModel.SelectedAgentId = string.Empty;
    }

    private void OnClearMilestoneInstruction(object sender, RoutedEventArgs e)
    {
        ViewModel.ModelInstruction = string.Empty;
    }

    private void OnClearCodexInstruction(object sender, RoutedEventArgs e)
    {
        ViewModel.CodexInstruction = string.Empty;
    }

    private void OnOpenAgentDefinitions(object sender, RoutedEventArgs e)
    {
        var window = new AgentDefinitionsWindow(_agentDefinitionService)
        {
            Owner = this
        };
        window.ShowDialog();
    }

    private PromptTemplate? PickTemplate()
    {
        var window = new InstructionLibraryWindow(_promptLibraryService)
        {
            Owner = this
        };

        return window.ShowDialog() == true ? window.SelectedTemplate : null;
    }

    private static string LocateRepoRoot()
    {
        var current = AppContext.BaseDirectory;
        var guard = 0;
        while (!string.IsNullOrEmpty(current) && guard++ < 10)
        {
            if (File.Exists(Path.Combine(current, "scripts", "Unified-Orchestration.ps1")))
            {
                return current;
            }
            var parent = Directory.GetParent(current);
            current = parent?.FullName;
        }

        throw new InvalidOperationException("Unable to locate the orchestration scripts from the application directory.");
    }
}
