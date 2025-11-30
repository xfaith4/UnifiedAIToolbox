# AI Orchestrator v3

This project is a collaborative, real-time "cockpit" interface for a graph-driven, multi-agent orchestration system. It allows users to provide a high-level goal, which an AI Supervisor then breaks down into a dynamic task graph executed by a team of specialized AI agents.

## Features

- **Dynamic Task Graphs:** Visualizes the agentic workflow in real-time.
- **Live Agent Execution:** Watch agent logs and artifacts get generated token-by-token.
- **Specialized Agents:** Dynamically assembles teams for analysis, code generation, and more.
- **File Ingestion:** Can analyze user-provided text-based files (`.txt`, `.json`, `.md`, etc.).
- **Session History:** Review, inspect, and export the results of previous runs.
- **Self-Improvement Loop:** Provide feedback to have an AI architect propose improvements to its own agents.

## Local Setup & Installation

To run this application on your local machine, you will need Node.js and npm installed.

1. **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd <repository_folder>
    ```

2. **Install dependencies:**
    This project is configured to run in an environment like AI Studio where dependencies are managed. For local development, you would typically run:

    ```bash
    npm install
    ```

3. **Configure your API Key:**
    The application requires a Google AI API key to function.

    - Create a file named `.env` in the root of the project directory.
    - Add your API key to this file as follows:

    ```
        # .env file
        API_KEY=AIzaSy...your...api...key...here
    ```

    - **Important:** The `.env` file is included in `.gitignore` and should **never** be committed to version control.

4. **Run the development server:**
    A `package.json` file with a start script would be required for local development. A typical command would be:

    ```bash
    npm run dev
    ```

    This will start a local server, usually at `http://localhost:3000`.

---

## Enterprise & Corporate Network Usage

Using this tool within a corporate network often requires approval from IT and Security teams. Here is the information you will need to provide them to ensure a smooth approval process.

### Network Configuration (Firewall Whitelisting)

The application makes direct calls to Google's Generative Language API. For these calls to succeed from behind a corporate firewall, the following endpoint must be whitelisted for outbound HTTPS (port 443) traffic:

- **Endpoint:** `generativelanguage.googleapis.com`

### Authentication: Service Accounts (Recommended)

While a personal API key from AI Studio is suitable for individual development, the recommended best practice for an enterprise environment is to use a **Google Cloud Service Account**.

**Why use a Service Account?**

- **Security:** Keys are not tied to an individual user's Google account. They can be managed, rotated, and revoked centrally.
- **Permissions:** You can grant the Service Account fine-grained IAM roles, adhering to the principle of least privilege.
- **Auditability:** All API calls made by the Service Account are logged in Google Cloud's Audit Logs, providing a clear trail of usage.

To implement this, your company's Google Cloud administrator would need to create a Service Account, grant it the "AI Platform Model User" role (or a more specific one), and provide you with the necessary credentials to authenticate from the application's environment.

### Security Team Checklist

You can provide the following summary to your security team:

- **Application:** AI Orchestrator - A frontend application for visualizing and interacting with a multi-agent AI workflow.
- **Data Sent:**
  - The user-provided text goal.
  - The content of any user-uploaded text file.
- **Data Destination:** All data is sent exclusively to `generativelanguage.googleapis.com` via HTTPS. No other third-party services are contacted.
- **Authentication:** The application authenticates using a standard Google AI API Key. We recommend using a project-specific Google Cloud Service Account for enhanced security and auditability.
- **Compliance:** The underlying Google Cloud services are compliant with major security standards. For more information, see the [Google Cloud Compliance documentation](https://cloud.google.com/security/compliance).
