using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Forms; // For MessageBox
using OrchestrationDesktop.Services;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.ViewModels;

namespace OrchestrationDesktop.Views;

public partial class InstructionLibraryWindow : Window
{
    private readonly InstructionLibraryViewModel? _viewModel;
    private bool _isInitialized = false;

    public InstructionLibraryWindow(PromptLibraryService libraryService)
    {
        if (libraryService is null)
        {
            throw new ArgumentNullException(nameof(libraryService));
        }

        // Initialize components first
        InitializeComponent();
        
        try 
        {
            // Create and set up view model
            _viewModel = new InstructionLibraryViewModel(libraryService);
            DataContext = _viewModel;
            _viewModel.PropertyChanged += OnViewModelPropertyChanged;
            
            // Initialize the UI state
            UpdateButtonState();
            _isInitialized = true;
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show($"Failed to initialize Instruction Library: {ex.Message}", 
                          "Initialization Error", 
                          System.Windows.MessageBoxButton.OK, 
                          System.Windows.MessageBoxImage.Error);
            Close();
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        try
        {
            // Clean up event handlers
            if (_viewModel is not null && _isInitialized)
            {
                _viewModel.PropertyChanged -= OnViewModelPropertyChanged;
            }
        }
        catch (Exception ex)
        {
            // Log the error if needed
            System.Diagnostics.Debug.WriteLine($"Error during window close: {ex}");
        }
        finally
        {
            base.OnClosed(e);
        }
    }

    public PromptTemplate? SelectedTemplate => (DataContext as InstructionLibraryViewModel)?.SelectedTemplate;

    private void OnUseTemplate(object sender, RoutedEventArgs e)
    {
        try
        {
            if (SelectedTemplate is null)
            return;

            DialogResult = true;
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show($"Failed to select template: {ex.Message}", 
                          "Error", 
                          System.Windows.MessageBoxButton.OK, 
                          System.Windows.MessageBoxImage.Error);
            DialogResult = false;
        }
        finally
        {
            Close();
        }
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
