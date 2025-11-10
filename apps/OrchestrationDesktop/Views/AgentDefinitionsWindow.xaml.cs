using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Windows;
using OrchestrationDesktop.Models;
using OrchestrationDesktop.Services;

namespace OrchestrationDesktop.Views;

public partial class AgentDefinitionsWindow : Window, INotifyPropertyChanged
{
    private readonly AgentDefinitionService _service;
    private AgentDefinition? _selectedAgent;

    public AgentDefinitionsWindow(AgentDefinitionService service)
    {
        _service = service ?? throw new ArgumentNullException(nameof(service));

        Agents = new ObservableCollection<AgentDefinition>(_service.Load());
        if (Agents.Count > 0)
        {
            SelectedAgent = Agents[0];
        }

        DataContext = this;
        UpdateUiState();
    }

    public ObservableCollection<AgentDefinition> Agents { get; }

    public AgentDefinition? SelectedAgent
    {
        get => _selectedAgent;
        set
        {
            if (!Equals(_selectedAgent, value))
            {
                _selectedAgent = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(SelectedAgent)));
                UpdateUiState();
            }
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnAddAgent(object sender, RoutedEventArgs e)
    {
        var agent = new AgentDefinition
        {
            Name = $"Agent {Agents.Count + 1}",
            Role = "system",
            Prompt = "Describe the responsibilities and tone for this agent."
        };

        Agents.Add(agent);
        SelectedAgent = agent;
    }

    private void OnRemoveAgent(object sender, RoutedEventArgs e)
    {
        if (SelectedAgent is null)
        {
            return;
        }

        var index = Agents.IndexOf(SelectedAgent);
        Agents.Remove(SelectedAgent);
        SelectedAgent = Agents.Count switch
        {
            0 => null,
            _ when index < Agents.Count => Agents[index],
            _ => Agents.Last()
        };
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        try
        {
            _service.Save(Agents);
            System.Windows.MessageBox.Show(this, "Agent definitions saved successfully.", "Agent Definitions", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(this, $"Failed to save agent definitions: {ex.Message}", "Agent Definitions", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void OnClose(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void UpdateUiState()
    {
        // RemoveAgentButton.IsEnabled = SelectedAgent is not null;
        // DetailsPanel.IsEnabled = SelectedAgent is not null;
    }
}
