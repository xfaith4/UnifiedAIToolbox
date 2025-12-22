import React from 'react';

const SkeletonLoader = ({ count = 3, height = '20px', width = '100%', className = '' }) => {
  return (
    <div className={`skeleton-loader ${className}`}>
      {[...Array(count)].map((_, index) => (
        <div 
          key={index}
          className="skeleton-line"
          style={{
            height,
            width: index === count - 1 && count > 1 ? '80%' : width,
            marginBottom: index < count - 1 ? '0.75rem' : '0',
            background: 'linear-gradient(90deg, #1a1f2e 0%, #2a2f3e 50%, #1a1f2e 100%)',
            backgroundSize: '200% 100%',
            borderRadius: '4px',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      ))}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton-loader {
          width: 100%;
          padding: 1rem;
        }
      `}</style>
    </div>
  );
};

export default SkeletonLoader;
