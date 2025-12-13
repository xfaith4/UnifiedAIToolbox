function Start-RepoManagerGUI {
    [CmdletBinding()]
    param(
        [string]$RootPath,
        [ValidateRange(7,365)]
        [int]$StaleThreshold = 30
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    $module = Get-Module -Name GitHubRepoManager -ListAvailable | Select-Object -First 1
    $modulePath = if ($module) { $module.Path } else { $MyInvocation.MyCommand.Definition }

    if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
        $arguments = @(
            '-NoProfile',
            '-Sta',
            '-Command',
            "& { Import-Module '$($modulePath)' ; Start-RepoManagerGUI -RootPath '$($map.Root)' -StaleThreshold $StaleThreshold }"
        )
        Start-Process -FilePath 'powershell' -ArgumentList $arguments -NoNewWindow -Wait
        return
    }

    Add-Type -AssemblyName PresentationFramework, PresentationCore

    $xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="GitHub Repo Manager" Height="520" Width="960">
    <DockPanel Margin="10">
        <StackPanel DockPanel.Dock="Top" Orientation="Horizontal" Margin="0,0,0,8" HorizontalAlignment="Right">
            <Button x:Name="UpdateButton" Content="Update" Width="90" Margin="4" />
            <Button x:Name="SyncButton" Content="Sync" Width="90" Margin="4" />
            <Button x:Name="ExportButton" Content="Export" Width="90" Margin="4" />
            <Button x:Name="ArchiveButton" Content="Archive" Width="90" Margin="4" />
            <Button x:Name="RefreshButton" Content="Refresh" Width="90" Margin="4" />
            <Button x:Name="ExitButton" Content="Exit" Width="90" Margin="4" />
        </StackPanel>
        <DataGrid x:Name="RepoGrid" AutoGenerateColumns="False" CanUserAddRows="False" IsReadOnly="True" GridLinesVisibility="Horizontal" EnableRowVirtualization="True">
            <DataGrid.Columns>
                <DataGridTextColumn Header="Repository" Binding="{Binding Repo}" Width="*" />
                <DataGridTextColumn Header="Branch" Binding="{Binding Branch}" Width="150" />
                <DataGridTextColumn Header="Ahead" Binding="{Binding Ahead}" Width="80" />
                <DataGridTextColumn Header="Behind" Binding="{Binding Behind}" Width="80" />
                <DataGridTextColumn Header="Last Commit" Binding="{Binding Date}" Width="200" />
                <DataGridTextColumn Header="Days Old" Binding="{Binding DaysOld}" Width="90" />
                <DataGridTextColumn Header="Behind Flag" Binding="{Binding BehindFlag}" Width="120" />
            </DataGrid.Columns>
        </DataGrid>
    </DockPanel>
</Window>
'@

    $reader = (New-Object System.Xml.XmlNodeReader ([xml]$xaml))
    $window = [Windows.Markup.XamlReader]::Load($reader)
    $grid = $window.FindName('RepoGrid')
    $update = $window.FindName('UpdateButton')
    $sync = $window.FindName('SyncButton')
    $export = $window.FindName('ExportButton')
    $archive = $window.FindName('ArchiveButton')
    $refresh = $window.FindName('RefreshButton')
    $exit = $window.FindName('ExitButton')

    $refreshData = {
        $data = @()
        $repos = Get-GitRepositories -RootPath $map.Root
        $index = 0
        foreach ($repo in $repos) {
            $index++
            $percent = if ($repos.Count -gt 0) { [math]::Round(($index / $repos.Count) * 100) } else { 100 }
            Write-Progress -Activity 'Loading repository status' -Status $repo.Name -PercentComplete $percent
            $status = Get-RepoStatus -RepositoryPath $repo.FullName
            $data += $status
        }
        Write-Progress -Activity 'Loading repository status' -Completed
        $grid.ItemsSource = $data
    }

    $grid.Add_LoadingRow({
        param($sender,$args)
        $item = $args.Row.Item
        $brush = [System.Windows.Media.Brushes]::DarkGreen
        if ($item.DaysOld -ge 9999) {
            $brush = [System.Windows.Media.Brushes]::Gray
        }
        elseif ($item.DaysOld -gt $StaleThreshold) {
            $brush = [System.Windows.Media.Brushes]::DarkRed
        }
        elseif ($item.BehindFlag -eq 'Yes') {
            $brush = [System.Windows.Media.Brushes]::Goldenrod
        }
        $args.Row.Background = $brush
    })

    $update.Add_Click({
        Update-AllRepos -RootPath $map.Root
        $refreshData.Invoke()
    })

    $sync.Add_Click({
        Sync-AllRepos -RootPath $map.Root
        $refreshData.Invoke()
    })

    $export.Add_Click({
        Export-RepoStatusReport -RootPath $map.Root
    })

    $archive.Add_Click({
        Archive-InactiveRepos -RootPath $map.Root -DaysInactive $StaleThreshold
        $refreshData.Invoke()
    })

    $refresh.Add_Click({
        $refreshData.Invoke()
    })

    $exit.Add_Click({
        $window.Close()
    })

    $window.Add_Loaded({
        $refreshData.Invoke()
    })

    $window.ShowDialog() | Out-Null
}
