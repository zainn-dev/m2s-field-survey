import { DocumentPageItem, HouseholdDocument } from '../../../../packages/shared/src/types/survey';

function encodeSvg(svg: string): string {
  const compact = svg.replace(/\s+/g, ' ').trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(compact)}`;
}

/**
 * Generates clean, compact, offline-safe SVG document preview thumbnails.
 * Aadhaar previews strictly display masked XXXX-XXXX-<last4> digits only.
 */
export function generateDocumentMockPreview(
  categoryId: string,
  docType: string,
  headName: string,
  surveyCode: string,
  last4 = '4821',
  pageNo = 1
): string {
  const safeHead = (headName || 'Household Head').replace(/[<>&"]/g, '');
  const safeCode = (surveyCode || 'M2S-001245').replace(/[<>&"]/g, '');
  const safeLast4 = (last4 || 'XXXX').replace(/[^0-9X]/g, '').slice(0, 4) || 'XXXX';

  if (categoryId === 'aadhaar') {
    return encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="420" height="270" viewBox="0 0 420 270">
        <rect width="420" height="270" rx="14" fill="#FFFFFF" stroke="#D7E2DC" stroke-width="2"/>
        <rect x="0" y="0" width="420" height="36" rx="14" fill="#F2F7F4"/>
        <rect x="18" y="10" width="76" height="6" rx="3" fill="#FF9933"/>
        <rect x="18" y="18" width="76" height="6" rx="3" fill="#138808"/>
        <text x="108" y="23" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#17231D">AADHAAR (MASKED PREVIEW)</text>
        <rect x="20" y="54" width="84" height="102" rx="8" fill="#E6ECE8"/>
        <circle cx="62" cy="88" r="18" fill="#9EB3A7"/>
        <path d="M36 142c4-18 16-24 26-24s22 6 26 24" fill="#9EB3A7"/>
        <text x="122" y="76" font-family="system-ui,sans-serif" font-size="15" font-weight="700" fill="#17231D">${safeHead}</text>
        <text x="122" y="98" font-family="system-ui,sans-serif" font-size="11" fill="#5C6B63">Lutumari Reserve Forest, Nagaon</text>
        <text x="122" y="118" font-family="system-ui,sans-serif" font-size="11" fill="#5C6B63">Ref: ${safeCode} · Page ${pageNo}</text>
        <rect x="122" y="138" width="220" height="32" rx="8" fill="#F3F6F4" stroke="#DCE5DF"/>
        <text x="136" y="159" font-family="monospace" font-size="16" font-weight="700" fill="#15804B">XXXX XXXX ${safeLast4}</text>
        <line x1="20" y1="224" x2="400" y2="224" stroke="#E2E8E4"/>
        <text x="20" y="246" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="#15804B">Private S3 Signed Copy · Last-4 Only Policy</text>
      </svg>
    `);
  }

  if (categoryId === 'family_photo') {
    return encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="420" height="270" viewBox="0 0 420 270">
        <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#D4EDE0"/><stop offset="100%" stop-color="#F3F6F4"/></linearGradient></defs>
        <rect width="420" height="270" rx="14" fill="url(#sky)" stroke="#D7E2DC" stroke-width="2"/>
        <path d="M0 190 Q110 155 210 185 T420 175 L420 270 L0 270 Z" fill="#B7DEC7"/>
        <polygon points="45,175 110,128 175,175" fill="#15804B" opacity="0.88"/>
        <rect x="65" y="175" width="90" height="55" fill="#FFFFFF" stroke="#15804B" stroke-width="2"/>
        <circle cx="240" cy="148" r="16" fill="#2F6146"/>
        <rect x="224" y="168" width="32" height="55" rx="10" fill="#15804B"/>
        <circle cx="288" cy="154" r="14" fill="#467C5E"/>
        <rect x="274" y="172" width="28" height="51" rx="9" fill="#1D8F55"/>
        <circle cx="332" cy="168" r="11" fill="#5D9273"/>
        <rect x="321" y="182" width="22" height="41" rx="8" fill="#F5C518"/>
        <rect x="16" y="16" width="245" height="28" rx="8" fill="#FFFFFF" opacity="0.94"/>
        <text x="26" y="34" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#17231D">${safeCode} · ${safeHead} Family</text>
      </svg>
    `);
  }

  const accent =
    categoryId === 'touzi_patta' || categoryId === 'land_records'
      ? '#B47B00'
      : categoryId === 'ration_card'
        ? '#15804B'
        : '#1E64B4';

  const bgTint =
    categoryId === 'touzi_patta'
      ? '#FFFDF5'
      : categoryId === 'ration_card'
        ? '#F6FCF8'
        : '#FFFFFF';

  return encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="270" viewBox="0 0 420 270">
      <rect width="420" height="270" rx="14" fill="${bgTint}" stroke="#D7E2DC" stroke-width="2"/>
      <rect x="0" y="0" width="420" height="44" rx="14" fill="#F2F6F4"/>
      <rect x="18" y="14" width="12" height="16" rx="3" fill="${accent}"/>
      <text x="40" y="27" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#17231D">${docType.replace(/[<>&"]/g, '')}</text>
      <text x="345" y="27" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#5C6B63">Page ${pageNo}</text>
      <rect x="22" y="62" width="376" height="145" rx="10" fill="#FFFFFF" stroke="#E2E8E4"/>
      <text x="38" y="92" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#17231D">${safeHead}</text>
      <text x="38" y="114" font-family="system-ui,sans-serif" font-size="11" fill="#5C6B63">Survey ID: ${safeCode}</text>
      <rect x="38" y="132" width="220" height="10" rx="5" fill="#E5ECE8"/>
      <rect x="38" y="150" width="290" height="10" rx="5" fill="#E5ECE8"/>
      <rect x="38" y="168" width="165" height="10" rx="5" fill="#E5ECE8"/>
      <circle cx="348" cy="176" r="22" fill="#EAF6EF" stroke="${accent}" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="331" y="180" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="${accent}">VERIFIED</text>
      <text x="22" y="242" font-family="system-ui,sans-serif" font-size="10" fill="#5C6B63">Lutumari Reserve Forest Archive · Signed View</text>
    </svg>
  `);
}

/**
 * Simulates obtaining a 60-second presigned GET URL without exposing public storage URLs.
 */
export function getSignedDocumentPreviewUrl(doc: HouseholdDocument, page: DocumentPageItem): {
  previewUrl: string;
  signedReference: string;
  expiresInSeconds: number;
} {
  return {
    previewUrl: page.localPreviewUrl,
    signedReference: `private-s3://m2s-private/${page.objectKey ?? `${doc.id}/p${page.pageNo}`}?X-Amz-Expires=60`,
    expiresInSeconds: 60,
  };
}
