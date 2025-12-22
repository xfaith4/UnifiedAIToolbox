
import React from 'react';
import type { Artifact } from '../types';
import { ArtifactType } from '../types';

interface ArtifactViewerProps {
  artifact: Artifact;
}

const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifact }) => {
  const renderArtifact = () => {
    switch (artifact.type) {
      case ArtifactType.CODE:
        return (
          <pre className="bg-black/70 text-sm text-green-300 p-4 rounded-md overflow-x-auto">
            <code>{artifact.content}</code>
          </pre>
        );
      case ArtifactType.IMAGE:
        return (
          <img
            src={`data:image/png;base64,${artifact.content}`}
            alt={artifact.name}
            className="rounded-md border-2 border-gray-600"
          />
        );
      case ArtifactType.REPORT:
      case ArtifactType.TEXT:
        return (
          <div className="prose prose-invert bg-black/50 p-4 rounded-md max-w-none">
            <pre className="bg-transparent p-0 text-white whitespace-pre-wrap font-sans">{artifact.content}</pre>
          </div>
        );
      default:
        return <p>Unsupported artifact type</p>;
    }
  };

  return (
    <div className="mt-2">
      <h4 className="font-semibold text-gray-300 mb-2">{artifact.name}</h4>
      {renderArtifact()}
    </div>
  );
};

export default ArtifactViewer;