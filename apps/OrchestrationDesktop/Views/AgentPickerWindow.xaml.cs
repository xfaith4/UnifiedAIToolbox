using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.Services;

namespace OrchestrationDesktop.Views;

public partial class AgentPickerWindow : Window
{
    private readonly AgentDefinitionService _agentDefinitionService;
    private IReadOnlyList<AgentDefinition> _allAgents = Array.Empty<AgentDefinition>();

    public AgentDefinition? SelectedAgent { get; private set; }
    public string? SelectedAgentId { get; private set; }

    public AgentPickerWindow(AgentDefinitionService agentDefinitionService)
    {
        InitializeComponent();

        _agentDefinitionService = agentDefinitionService;
        LoadAgents();
    }

    private void LoadAgents()
    {
        _allAgents = _agentDefinitionService.Load();
        ApplyFilter();
    }

    private void OnFilterChanged(object sender, TextChangedEventArgs e)
    {
        ApplyFilter();
    }

    private void ApplyFilter()
    {
        var filter = SearchBox.Text?.Trim() ?? string.Empty;
        IEnumerable<AgentDefinition> filtered = _allAgents;
        if (!string.IsNullOrWhiteSpace(filter))
        {
            filtered = filtered.Where(agent =>
                agent.Name.Contains(filter, StringComparison.OrdinalIgnoreCase) ||
                agent.Role.Contains(filter, StringComparison.OrdinalIgnoreCase));
        }

        AgentList.ItemsSource = filtered.ToList();
        if (!AgentList.Items.Contains(SelectedAgent))
        {
            AgentList.SelectedIndex = 0;
        }
    }

    private void OnAgentDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (AgentList.SelectedItem is AgentDefinition agent)
        {
            CaptureSelection(agent);
            DialogResult = true;
        }
    }

    private void OnConfirm(object sender, RoutedEventArgs e)
    {
        if (AgentList.SelectedItem is not AgentDefinition agent)
        {
            MessageBox.Show(this, "Select an agent from the list.", "Agent Picker", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        CaptureSelection(agent);
        DialogResult = true;
    }

    private void CaptureSelection(AgentDefinition agent)
    {
        SelectedAgent = agent;
        SelectedAgentId = BuildAgentId(agent.Name);
    }

    private static string BuildAgentId(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return string.Empty;
        }

        var slug = Regex.Replace(name.ToLowerInvariant(), "[^\\w-]", "-").Trim('-');
        return $"ag_{slug}";
    }
}
