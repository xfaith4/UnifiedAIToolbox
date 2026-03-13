
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env['API_KEY'], vertexai: true });

export const decomposeTask = async (task: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: [{ text: `Decompose the following complex task into 5-8 discrete, actionable sub-tasks for a swarm of AI agents: "${task}"` }]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ['title', 'description']
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error decomposing task:", error);
    // Fallback tasks if API fails
    return [
      { title: "Initialize Swarm", description: "Bootstrapping agent protocols and communication channels." },
      { title: "Data Gathering", description: "Scraping relevant datasets from distributed nodes." },
      { title: "Pattern Analysis", description: "Identifying core clusters and anomalies in the data." },
      { title: "Synthesis", description: "Merging findings into a cohesive strategy." },
      { title: "Validation", description: "Cross-checking results against swarm constraints." }
    ];
  }
};
