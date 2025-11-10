using System.Windows;
using System.Windows.Input;

namespace OrchestrationDesktop.Views;

public partial class ApiKeyPromptWindow : Window
{
    private readonly string? _existingKey;

    public ApiKeyPromptWindow(string? existingKey)
    {
        InitializeComponent();

        _existingKey = string.IsNullOrWhiteSpace(existingKey) ? null : existingKey;

        if (_existingKey is not null)
        {
            ExistingKeyText.Visibility = Visibility.Visible;
            UseExistingButton.Visibility = Visibility.Visible;
        }

        Loaded += OnLoaded;
    }

    public string? ApiKey { get; private set; }
    public bool UseExistingKey { get; private set; }

    private void OnLoaded(object? sender, RoutedEventArgs e)
    {
        ApiKeyBox.Focus();
    }

    private void OnOk(object sender, RoutedEventArgs e)
    {
        AcceptEnteredKey();
    }

    private void OnUseExisting(object sender, RoutedEventArgs e)
    {
        if (_existingKey is null)
        {
            return;
        }

        UseExistingKey = true;
        ApiKey = _existingKey;
        DialogResult = true;
    }

    private void OnCancel(object sender, RoutedEventArgs e)
    {
        ApiKey = null;
        UseExistingKey = false;
        DialogResult = false;
    }

    private void OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (ErrorText.Visibility == Visibility.Visible)
        {
            ErrorText.Visibility = Visibility.Collapsed;
        }
    }

    private void OnPasswordBoxKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            e.Handled = true;
            AcceptEnteredKey();
        }
    }

    private void AcceptEnteredKey()
    {
        var key = ApiKeyBox.Password.Trim();
        if (string.IsNullOrEmpty(key))
        {
            ErrorText.Visibility = Visibility.Visible;
            ApiKey = null;
            UseExistingKey = false;
            return;
        }

        ApiKey = key;
        UseExistingKey = false;
        DialogResult = true;
    }
}
