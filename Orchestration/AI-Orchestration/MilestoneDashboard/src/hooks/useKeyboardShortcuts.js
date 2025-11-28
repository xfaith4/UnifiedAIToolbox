import { useEffect } from 'react';

export const useKeyboardShortcuts = (shortcuts) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if the user is typing in an input/textarea
      const isTyping = ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
      
      shortcuts.forEach(({ key, ctrlKey, metaKey, shiftKey, callback, allowWhileTyping = false }) => {
        // Support both Ctrl (Windows/Linux) and Meta (Mac)
        const ctrlOrMeta = (ctrlKey && event.ctrlKey) || (metaKey && event.metaKey);
        const matchesShift = shiftKey ? event.shiftKey : !event.shiftKey;
        const matchesKey = event.key.toLowerCase() === key.toLowerCase();
        
        if (matchesKey && ctrlOrMeta && matchesShift) {
          if (allowWhileTyping || !isTyping) {
            event.preventDefault();
            callback();
          }
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};
