/** Product name is configuration (VITE_APP_NAME), never hard-coded to a bank. */
export const APP_NAME: string = (import.meta as any).env?.VITE_APP_NAME || "ULYSSE";
