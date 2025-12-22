using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.Services;

namespace OrchestrationDesktop.Views;

public partial class PromptPickerWindow : Window
{
    private readonly PromptLibraryService _promptLibraryService;
    private IReadOnlyList<PromptTemplate> _allTemplates = Array.Empty<PromptTemplate>();

    public PromptTemplate? SelectedTemplate { get; private set; }

    public PromptPickerWindow(PromptLibraryService promptLibraryService)
    {
        InitializeComponent();

        _promptLibraryService = promptLibraryService;
        LoadTemplates();
    }

    private void LoadTemplates()
    {
        _allTemplates = _promptLibraryService.LoadTemplates();
        ApplyFilter();
    }

    private void OnFilterChanged(object sender, TextChangedEventArgs e)
    {
        ApplyFilter();
    }

    private void ApplyFilter()
    {
        var filter = SearchBox.Text?.Trim() ?? string.Empty;
        IEnumerable<PromptTemplate> filtered = _allTemplates;
        if (!string.IsNullOrWhiteSpace(filter))
        {
            filtered = filtered.Where(t =>
                t.DisplayName.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
                t.Id.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
                t.Description.Contains(filter, StringComparison.OrdinalIgnoreCase));
        }

        var list = filtered.ToList();
        PromptList.ItemsSource = list;

        if (list.Count == 0)
        {
            PromptList.SelectedIndex = -1;
            return;
        }

        if (!PromptList.Items.Contains(SelectedTemplate))
        {
            PromptList.SelectedIndex = 0;
        }
    }

    private void OnPromptDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (PromptList.SelectedItem is PromptTemplate template)
        {
            SelectedTemplate = template;
            DialogResult = true;
        }
    }

    private void OnConfirm(object sender, RoutedEventArgs e)
    {
        if (PromptList.SelectedItem is not PromptTemplate template)
        {
            System.Windows.MessageBox.Show(this, "Select a prompt from the list.", "Prompt Picker", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        SelectedTemplate = template;
        DialogResult = true;
    }
}
