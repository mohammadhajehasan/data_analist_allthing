/**
 * ShareToGroupModal — pick one of your discussion groups and send a
 * dashboard-widget screenshot (PNG data URL) with an optional caption.
 * Reuses the same auth token and /api/discussions endpoints.
 */
import React, { useState, useEffect } from 'react';
import { X, Users, Loader2, Send, Image as ImageIcon, Crown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getStoredToken } from '../../features/auth/LoginPage';

interface MemberRef { id: string; name: string; role: 'owner' | 'member' }
interface Discussion {
  id: string; name: string; topic: string | null;
  members: MemberRef[]; memberCount: number;
  lastMessage: { body: string; authorName: string; createdAt: string } | null;
  isMember: boolean; isOwner: boolean;
}

interface ShareToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** PNG data URL of the captured widget (from captureElementToCanvas().toDataURL) */
  imageDataUrl: string | null;
  widgetName: string;
  /** Where the snapshot came from — used for per-tab unread badges ('dashboard' | 'reports'). */
  source?: 'dashboard' | 'reports';
}

/** Downscale a data URL so it stays under maxBytes (reduces scale each pass). */
async function downscaleDataUrl(dataUrl: string, maxBytes: number): Promise<string> {
  const approxBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  if (approxBytes <= maxBytes) return dataUrl;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('failed to load image for downscale'));
    img.src = dataUrl;
  });
  for (const scale of [0.75, 0.5, 0.35, 0.25]) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.85);
    const outBytes = Math.floor((out.length - out.indexOf(',') - 1) * 0.75);
    if (outBytes <= maxBytes) return out;
  }
  throw new Error('تعذر تصغير الصورة إلى الحد المسموح');
}

export const ShareToGroupModal: React.FC<ShareToGroupModalProps> = ({ isOpen, onClose, imageDataUrl, widgetName, source = 'dashboard' }) => {
  const { toast, language } = useApp();
  const isAr = language === 'ar';
  const [groups, setGroups] = useState<Discussion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) { setSelectedId(null); setCaption(''); return; }
    setLoading(true);
    const token = getStoredToken();
    fetch('/api/discussions', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل تحميل المجموعات');
        setGroups(data.mine || []);
        // Pre-select when the user belongs to exactly one group
        if ((data.mine || []).length === 1) setSelectedId(data.mine[0].id);
      })
      .catch((err: any) => toast.error(isAr ? 'خطأ' : 'Error', err.message))
      .finally(() => setLoading(false));
  }, [isOpen, toast, isAr]);

  // Downscale once per open for the preview + payload
  useEffect(() => {
    if (!isOpen || !imageDataUrl) { setPreview(null); return; }
    let cancelled = false;
    downscaleDataUrl(imageDataUrl, 2.5 * 1024 * 1024)
      .then(out => { if (!cancelled) setPreview(out); })
      .catch((err: any) => { if (!cancelled) toast.error(isAr ? 'خطأ' : 'Error', err.message); });
    return () => { cancelled = true; };
  }, [isOpen, imageDataUrl, toast, isAr]);

  const send = async () => {
    if (!selectedId || !preview) return;
    setSending(true);
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/discussions/${selectedId}/messages`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: caption.trim() || (isAr ? `📷 لقطة من: ${widgetName}` : `📷 Snapshot: ${widgetName}`),
          imageData: preview,
          snapshotSource: source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال');
      toast.success(
        isAr ? 'تمت المشاركة' : 'Shared',
        isAr ? `تم إرسال لقطة "${widgetName}" إلى المجموعة` : `Snapshot of "${widgetName}" sent to the group`
      );
      onClose();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[var(--cds-layer-01,#262626)] border border-[var(--cds-border-subtle,#393939)] rounded-2xl shadow-2xl p-5"
        onClick={e => e.stopPropagation()}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--cds-text-01,#f4f4f4)] flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[#0f62fe]" />
            {isAr ? 'مشاركة اللقطة في مناقشة' : 'Share snapshot to a discussion'}
          </h3>
          <button onClick={onClose} className="text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Screenshot preview */}
        {preview && (
          <div className="mb-3 border border-[var(--cds-border-subtle,#393939)] rounded-lg overflow-hidden bg-[var(--cds-layer-02,#161616)]">
            <img src={preview} alt={widgetName} className="w-full max-h-44 object-contain" />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#0f62fe]" />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-xs text-[var(--cds-text-03,#8d8d8d)] text-center py-6">
            {isAr
              ? 'لا توجد مجموعات تناقش فيها بعد — أنشئ مجموعة من صفحة المناقشات أولاً'
              : 'No groups yet — create one from the Discussions page first'}
          </p>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-[var(--cds-text-02,#c6c6c6)] mb-1.5">
              {isAr ? 'اختر المجموعة:' : 'Choose group:'}
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  className={`w-full text-start px-2.5 py-2 rounded-lg border flex items-center gap-2 transition-colors ${
                    selectedId === g.id
                      ? 'bg-[#0f62fe]/15 border-[#0f62fe]/50'
                      : 'bg-[var(--cds-layer-02,#161616)] border-[var(--cds-border-subtle,#393939)] hover:border-[var(--cds-border-strong,#6f6f6f)]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-[#78a9ff] shrink-0" />
                  <span className="text-xs font-semibold text-[var(--cds-text-01,#f4f4f4)] truncate flex-1">{g.name}</span>
                  {g.isOwner && <Crown className="w-3 h-3 text-[#f1c21b]" />}
                  <span className="text-[10px] text-[var(--cds-text-03,#8d8d8d)]">{g.memberCount}</span>
                </button>
              ))}
            </div>

            <input
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder={isAr ? 'تعليق (اختياري)...' : 'Caption (optional)...'}
              className="w-full px-3 py-2.5 text-xs bg-[var(--cds-layer-02,#161616)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden mb-3"
            />

            <div className="flex gap-2">
              <button
                onClick={send}
                disabled={!selectedId || !preview || sending}
                className="flex-1 py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال اللقطة' : 'Send Snapshot')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-semibold text-[var(--cds-text-02,#c6c6c6)] border border-[var(--cds-border-subtle,#393939)] rounded-lg hover:bg-[var(--cds-layer-02,#161616)]"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
