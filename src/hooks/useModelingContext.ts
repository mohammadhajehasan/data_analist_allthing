import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';

export const useModelingContext = () => {
  const { activeDataset } = useApp();
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const forceSync = useCallback(() => {
    setLastUpdated(Date.now());
  }, []);

  return {
    activeDataset,
    lastUpdated,
    forceSync
  };
};
