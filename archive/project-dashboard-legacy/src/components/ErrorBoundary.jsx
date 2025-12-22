import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" style={{
          padding: '2rem',
          background: '#1a1f2e',
          color: '#e6eef5',
          borderRadius: '8px',
          maxWidth: '800px',
          margin: '2rem auto',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#ff6b6b' }}>⚠️ Something went wrong</h2>
          <p style={{ margin: '1rem 0' }}>
            {this.state.error?.message || 'An unknown error occurred'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              background: '#45d0a8',
              color: '#0b0f14',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginTop: '1rem'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
