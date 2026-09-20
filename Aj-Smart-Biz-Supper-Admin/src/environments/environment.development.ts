export const environment = {
  production: false,
  apiUrl: '/api/v1',
  /**
   * Origin serving /uploads. Empty means same-origin, which is now true in
   * development too: `proxy.conf.json` forwards /uploads to the API, so an
   * https dev tunnel does not end up with <img src="http://..."> that the
   * browser blocks as mixed content.
   */
  filesUrl: '',
  appName: 'Aj Smart Biz — Super Admin',
  storagePrefix: 'ajsb_sa_',
};
