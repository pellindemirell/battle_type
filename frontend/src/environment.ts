const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname;

export const environment = {
  apiUrl: `http://${host}:5027`
};
