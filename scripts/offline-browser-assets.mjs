// Opt-in QA only: isolate app behavior from external font/branding outages.
// No provider/result requests are replaced here. Report this mode explicitly.
export async function offlineBrowserAssets(page) {
  if (process.env.QA_OFFLINE_ASSETS !== 'true') return;
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|grok\.com)\//, route =>
    route.fulfill({status:200,contentType:route.request().resourceType()==='stylesheet'?'text/css':'application/javascript',body:''}));
}
