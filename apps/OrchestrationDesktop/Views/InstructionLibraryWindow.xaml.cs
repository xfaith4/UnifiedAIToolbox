using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using OrchestrationDesktop.Services;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.ViewModels;

namespace OrchestrationDesktop.Views;

public partial class InstructionLibraryWindow : Window
{
    private readonly InstructionLibraryViewModel _viewModel;

    public InstructionLibraryWindow(PromptLibraryService libraryService)
    {
        if (libraryService is null)
        {
            throw new ArgumentNullException(nameof(libraryService));
        }

        InitializeComponent();
        _viewModel = new InstructionLibraryViewModel(libraryService);
        DataContext = _viewModel;
        _viewModel.PropertyChanged += OnViewModelPropertyChanged;
        UpdateButtonState();
    }

    protected override void OnClosed(EventArgs e)
    {
        base.OnClosed(e);
        _viewModel.PropertyChanged -= OnViewModelPropertyChanged;
    }

    public PromptTemplate? SelectedTemplate => (DataContext as InstructionLibraryViewModel)?.SelectedTemplate;

    private void OnUseTemplate(object sender, RoutedEventArgs e)
    {
        if (SelectedTemplate is null)
        {
            return;
        }

        DialogResult = true;
        Close();
    }

    private void OnCancel(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (string.Equals(e.PropertyName, nameof(InstructionLibraryViewModel.SelectedTemplate)))
        {
            UpdateButtonState();
        }
    }

    private void UpdateButtonState()
    {
        if (FindName("UseTemplateButton") is System.Windows.Controls.Button button)
        {
            button.IsEnabled = SelectedTemplate is not null;
        }
    }
}
