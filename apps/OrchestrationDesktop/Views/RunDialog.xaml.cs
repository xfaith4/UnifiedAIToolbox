using System.Windows;

namespace OrchestrationDesktop.Views
{
    public partial class RunDialog : Window
    {
        public RunDialog()
        {
            InitializeComponent();
        }
        private void OnClose(object sender, RoutedEventArgs e) => this.Close();
    }
}
