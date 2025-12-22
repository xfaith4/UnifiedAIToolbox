using System;

namespace OrchestrationDesktop.Models
{
    public class OrchestrationOptions
    {
        /// <summary>
        /// Gets or sets the path to the goal file.
        /// </summary>
        public string? GoalFile { get; set; }

        /// <summary>
        /// Gets or sets the direct goal text as an alternative to GoalFile.
        /// </summary>
        public string? DirectGoalText { get; set; }

        /// <summary>
        /// Gets or sets the project path.
        /// </summary>
        public string? ProjectPath { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether to enable verbose logging.
        /// </summary>
        public bool Verbose { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether to enable debug mode.
        /// </summary>
        public bool Debug { get; set; }

        // Add any other properties that might be needed based on PowerShellService.cs
    }
}
