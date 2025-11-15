using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace OrchestrationDesktop.Models;

public sealed class AgentDefinition : INotifyPropertyChanged
{
    private string _name = string.Empty;
    private string _role = "system";
    private string _prompt = string.Empty;

    public string Name
    {
        get => _name;
        set
        {
            if (SetField(ref _name, value))
            {
                OnPropertyChanged(nameof(DisplayName));
            }
        }
    }

    public string Role
    {
        get => _role;
        set => SetField(ref _role, value);
    }

    public string Prompt
    {
        get => _prompt;
        set => SetField(ref _prompt, value);
    }

    public string DisplayName => $"{Name} ({Role})";

    public event PropertyChangedEventHandler? PropertyChanged;

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
