import { createContext, useContext } from 'react';

/** Present only on the hosted, browser-setup version of the dashboard. */
export const SetupContext = createContext<{ openSetup: () => void } | null>(null);

export const useSetup = () => useContext(SetupContext);
