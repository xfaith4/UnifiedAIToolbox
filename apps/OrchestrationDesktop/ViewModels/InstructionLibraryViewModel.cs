using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows.Data;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.Services;

namespace OrchestrationDesktop.ViewModels;

public sealed class InstructionLibraryViewModel : INotifyPropertyChanged
{
    private readonly PromptLibraryService _libraryService;
    private readonly ObservableCollection<PromptTemplate> _templates = new();
    private string _searchText = string.Empty;
    private string _selectedCategory = "All";
    private PromptTemplate? _selectedTemplate;

    public InstructionLibraryViewModel(PromptLibraryService libraryService)
    {
        _libraryService = libraryService ?? throw new ArgumentNullException(nameof(libraryService));

        TemplatesView = CollectionViewSource.GetDefaultView(_templates);
        TemplatesView.Filter = FilterTemplate;

        LoadTemplates();
    }

    public ICollectionView TemplatesView { get; }

    public IReadOnlyList<string> Categories { get; private set; } = Array.Empty<string>();

    public string SearchText
    {
        get => _searchText;
        set
        {
            if (SetField(ref _searchText, value))
            {
                TemplatesView.Refresh();
            }
        }
    }

    public string SelectedCategory
    {
        get => _selectedCategory;
        set
        {
            if (SetField(ref _selectedCategory, value))
            {
                TemplatesView.Refresh();
            }
        }
    }

    public PromptTemplate? SelectedTemplate
    {
        get => _selectedTemplate;
        set => SetField(ref _selectedTemplate, value);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void LoadTemplates()
    {
        _templates.Clear();
        foreach (var template in _libraryService.LoadTemplates())
        {
            _templates.Add(template);
        }

        var categories = _templates
            .Select(t => t.Category)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(c => c, StringComparer.OrdinalIgnoreCase)
            .ToList();
        categories.Insert(0, "All");

        Categories = categories;
        OnPropertyChanged(nameof(Categories));
        TemplatesView.Refresh();

        SelectedTemplate = _templates.FirstOrDefault();
    }

    private bool FilterTemplate(object item)
    {
        if (item is not PromptTemplate template)
        {
            return false;
        }

        if (!string.Equals(SelectedCategory, "All", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(template.Category, SelectedCategory, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(SearchText))
        {
            return true;
        }

        return template.DisplayName.Contains(SearchText, StringComparison.OrdinalIgnoreCase) ||
               template.Description.Contains(SearchText, StringComparison.OrdinalIgnoreCase) ||
               template.Content.Contains(SearchText, StringComparison.OrdinalIgnoreCase);
    }

    private bool SetField<T>(ref T storage, T value, [CallerMemberName] string? propertyName = null)
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
