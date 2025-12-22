using Microsoft.Win32;
using System;
using System.Windows;

public static class ThemeController
{
    public static void ApplyAutoTheme()
    {
        try
        {
            // Detect Windows theme (AppsUseLightTheme = 0 => dark)
            var v = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                                      "AppsUseLightTheme", 0);
            var isLight = (v is int i && i == 1);
            // Swap palette here if you add a Light.xaml; for now we keep dark by default.
        }
        catch { /* ignore, default to dark */ }
    }
}
