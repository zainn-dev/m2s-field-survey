import React, { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, RefreshCw, Sparkles, X } from 'lucide-react';
import type { Language } from '../types/survey';
import { triggerApkDownload, type AppVersionPayload } from '../utils/appUpdate';

export interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  updateInfo: AppVersionPayload | null;
  language: Language;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  open,
  onClose,
  updateInfo,
  language,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const hi = language === 'hi';

  if (!open || !updateInfo) return null;

  const handleDownload = () => {
    setDownloading(true);
    setDownloadStarted(true);
    try {
      localStorage.setItem(`m2s_downloaded_update_${updateInfo.versionCode}`, 'true');
    } catch {}
    triggerApkDownload(updateInfo.apkUrl);
    setTimeout(() => {
      setDownloading(false);
    }, 2000);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(`m2s_dismissed_update_${updateInfo.versionCode}`, 'true');
    } catch {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-[22px] border border-[#E7E2D4] p-5 shadow-2xl space-y-4">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 p-2 rounded-full text-[#726C5D] hover:bg-[#FAF8F2] transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon + Title */}
        <div className="flex items-center gap-3 pr-8">
          <span className="w-12 h-12 rounded-2xl bg-[#FFF8D6] text-[#8C6200] border border-[#EED77C] grid place-items-center shrink-0">
            <Sparkles className="w-6 h-6" />
          </span>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FAF8F2] border border-[#E7E2D4] text-[11px] font-bold text-[#8C6200] uppercase tracking-wide">
              {hi ? 'नया अपडेट उपलब्ध' : 'New Update Ready'}
            </div>
            <h2 className="text-[17.5px] font-extrabold text-[#181611] leading-snug mt-0.5">
              {hi ? `ऐप अपडेट उपलब्ध है (${updateInfo.version})` : `Update App to ${updateInfo.version}`}
            </h2>
          </div>
        </div>

        {/* Release Notes */}
        <div className="rounded-[14px] bg-[#FFFDF2] border border-[#EED77C] p-3.5 text-[12.5px] text-[#5C4100] space-y-1.5">
          <p className="font-bold text-[#181611] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#2E7D32]" />
            {hi ? 'इस अपडेट में क्या नया है:' : "What's new in this release:"}
          </p>
          <p className="leading-relaxed text-[#4A3C00]">
            {updateInfo.releaseNotes ||
              (hi
                ? 'सर्वे फॉर्म्स में सुधार, सिंगल-सेलेक्ट डाक्यूमेंट्स, और परफॉरमेंस अपग्रेड।'
                : 'Survey improvements, single-select document verification, and performance enhancements.')}
          </p>
        </div>

        {/* Safe Data Guarantee */}
        <div className="bg-[#FAF8F2] rounded-[12px] border border-[#E7E2D4] p-3 text-[12px] text-[#5C5547] space-y-1">
          <p className="font-semibold text-[#181611]">
            {hi ? '✓ आपका पुराना कोई भी डेटा डिलीट नहीं होगा' : '✓ All your saved drafts and offline data are preserved'}
          </p>
          <p className="text-[11.5px] text-[#726C5D]">
            {hi
              ? 'अपडेट करने के बाद आपके पहले से सुरक्षित ड्राफ्ट्स, लॉगिन, और पेंडिंग सर्वे बिल्कुल सुरक्षित रहेंगे।'
              : 'Installing the update will retain all your current surveys, cached cluster records, and login session.'}
          </p>
        </div>

        {/* Step-by-Step Instructions if download triggered */}
        {downloadStarted && (
          <div className="rounded-[12px] bg-[#F0FDF4] border border-[#BBF7D0] p-3 text-[12px] text-[#166534] space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <Download className="w-4 h-4" />
              {hi ? 'डाउनलोड शुरू हो गया है!' : 'Download started!'}
            </p>
            <ol className="list-decimal pl-4 space-y-1 text-[11.5px] text-[#15803D]">
              <li>
                {hi
                  ? 'अपने फोन की नोटिफिकेशन बार में डाउनलोड पूरा होने दें।'
                  : 'Let the APK download finish in your notification bar.'}
              </li>
              <li>
                {hi
                  ? 'm2s-field-survey.apk पर टैप करके "Update" चुनें।'
                  : 'Tap m2s-field-survey.apk in notifications and select "Update".'}
              </li>
              <li>
                {hi
                  ? 'ऐप तुरंत अपडेट होकर खुल जाएगी।'
                  : 'The app will instantly update and relaunch.'}
              </li>
            </ol>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="w-full h-12 rounded-[12px] bg-[#181611] hover:bg-[#2A261D] text-[#FDC513] text-[14px] font-bold inline-flex items-center justify-center gap-2 shadow-md transition disabled:opacity-75"
          >
            {downloading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {hi ? 'डाउनलोड हो रहा है...' : 'Starting download...'}
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                {hi
                  ? `अभी अपडेट करें ${updateInfo.apkSize ? `(${updateInfo.apkSize})` : ''}`
                  : `Update App Now ${updateInfo.apkSize ? `(${updateInfo.apkSize})` : ''}`}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-full h-10 rounded-[10px] text-[#726C5D] hover:bg-[#FAF8F2] text-[13px] font-semibold transition"
          >
            {hi ? 'बाद में याद दिलाएं' : 'Remind Me Later'}
          </button>
        </div>
      </div>
    </div>
  );
};

