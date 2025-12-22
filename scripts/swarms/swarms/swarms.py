from swarms import Agent

# Initialize a new agent
agent = Agent(
    model_name="gpt-4o-mini", # Specify the LLM
    max_loops=1, # Set the number of interactions
    interactive=True,         # Enable interactive mode for real-time feedback
)

# Run the agent with a task
agent.run("What are the key benefits of using a multi-agent system?")
```

### 🤝 Your First Swarm: Multi-Agent Collaboration

A **Swarm** consists of multiple agents working together. This simple example creates a two-agent workflow for researching and writing a blog post. [Learn More About SequentialWorkflow](https://docs.swarms.world/en/latest/swarms/structs/sequential_workflow/)
