using System;
using System.Windows;
using OrchestrationDesktop.Services;
using OrchestrationDesktop.ViewModels;

namespace OrchestrationDesktop.Views;

public partial class PromptBatchRefinementWindow : Window
{
    public PromptBatchRefinementWindow(PowerShellService powerShellService, string repoRoot)
    {
        if (powerShellService is null)
        {
            throw new ArgumentNullException(nameof(powerShellService));
        }

        if (string.IsNullOrWhiteSpace(repoRoot))
        {
            throw new ArgumentException("Repo root is required.", nameof(repoRoot));
        }

        InitializeComponent();
        DataContext = new PromptBatchRefinementViewModel(powerShellService, repoRoot);
    }
}
