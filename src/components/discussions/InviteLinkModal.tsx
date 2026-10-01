/**
 * InviteLinkModal — group owner generates & manages secret invite links.
 * The link is the ONLY way for a non-member to reach the private group.
 * Supports max-uses, copy-to-clipboard, revocation, and usage listing.
 */
import React, { useState, useEffect } from 'react';
import { X, Link2, Copy, Check, Trash2, Loader2, Crown, Mail } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getStoredToken } from '../../features/auth/LoginPage';

interface InviteRow {
  code: string; createdAt: string; expiresAt: string;
  useCount: number; maxUses: number | null; revoked: boolean;
}

interface EmailInviteRow {
  code: string; invitedEmail: string; createdAt: string; expiresAt: string;
  status: 'pending' | 'consumed' | 'expired' | 'revoked'; consumedByName?: string;
}

interface InviteLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  discussionId: string;
  discussionName: string;
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const InviteLinkModal: React.FC<InviteLinkModalProps> = ({ isOpen, onClose, discussionId, discussionName }) => {
  const { toast, language } = useApp();
  const isAr = language === 'ar';
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [emailInvites, setEmailInvites] = useState<EmailInviteRow[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/discussions/${discussionId}/invites`, { headers: authHeaders() }),
        fetch(`/api/discussions/${discussionId}/email-invites`, { headers: authHeaders() }),
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      if (!r1.ok) throw new Error(d1.error || 'فشل تحميل الروابط');
      setInvites(d1.invites || []);
      setEmailInvites(r2.ok ? (d2.invites || []) : []);
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const revokeEmailInvite = async (code: string) => {
    setBusyCode(code);
    try {
      const res = await fetch(`/api/discussions/${discussionId}/email-invites/${encodeURIComponent(code)}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإلغاء');
      toast.success(isAr ? 'أُلغيت دعوة البريد' : 'Email invite revoked');
      await load();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setBusyCode(null);
    }
  };

  useEffect(() => { if (isOpen) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isOpen]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/discussions/${discussionId}/invites`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxUses: maxUses ? Number(maxUses) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء الرابط');
      toast.success(isAr ? 'تم إنشاء الرابط' : 'Link created', isAr ? 'شارك الرابط مع من تريد دعوته' : 'Share the link with who you want to invite');
      setMaxUses('');
      await load();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (code: string) => {
    try {
      const res = await fetch(`/api/discussions/${discussionId}/invites/${encodeURIComponent(code)}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإلغاء');
      await load();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/join/${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.info(url);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[var(--cds-layer-01,#262626)] border border-[var(--cds-border-subtle,#393939)] rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--cds-text-01,#f4f4f4)] flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#0f62fe]" />
            {isAr ? `روابط دعوة: ${discussionName}` : `Invite links: ${discussionName}`}
          </h3>
          <button onClick={onClose} className="text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)] mb-3">
          {isAr
            ? '🔒 المجموعة خاصة تماماً — لا يراها أحد سوى أعضائها. من حصل على الرابط يستطيع الانضمام، ويمكنك إلغاء أي رابط في أي وقت.'
            : '🔒 This group is fully private — only members can see it. Anyone with the link can join; you can revoke any link anytime.'}
        </p>

        {/* Create new link */}
        <div className="flex items-center gap-2 mb-4">
          <input
            value={maxUses}
            onChange={e => setMaxUses(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={isAr ? 'حد أقصى للاستخدامات (اختياري)' : 'Max uses (optional)'}
            className="flex-1 px-3 py-2 text-xs bg-[var(--cds-layer-02,#161616)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden"
          />
          <button
            onClick={create} disabled={creating}
            className="px-3 py-2 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {isAr ? 'رابط جديد' : 'New link'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#0f62fe]" /></div>
        ) : invites.length === 0 && emailInvites.length === 0 ? (
          <p className="text-xs text-[var(--cds-text-03,#8d8d8d)] text-center py-4">
            {isAr ? 'لا روابط بعد — أنشئ رابطاً وشاركه' : 'No links yet — create one and share it'}
          </p>
        ) : (
          <div className="space-y-2">
            {invites.map(inv => {
              const dead = inv.revoked || new Date(inv.expiresAt) <= new Date();
              return (
                <div key={inv.code} className={`border rounded-lg p-2.5 ${dead ? 'border-[var(--cds-border-subtle,#393939)] opacity-60' : 'border-[#0f62fe]/40 bg-[#0f62fe]/5'}`}>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] font-mono text-[var(--cds-text-02,#c6c6c6)] truncate" dir="ltr">
                      /join/{inv.code.slice(0, 12)}…
                    </code>
                    {!dead && (
                      <button
                        onClick={() => copyLink(inv.code)}
                        title={isAr ? 'نسخ الرابط' : 'Copy link'}
                        className="p-1.5 rounded-md text-[#78a9ff] hover:bg-[#0f62fe]/20"
                      >
                        {copied === inv.code ? <Check className="w-3.5 h-3.5 text-[#42be65]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {!dead && (
                      <button
                        onClick={() => revoke(inv.code)}
                        title={isAr ? 'إلغاء الرابط' : 'Revoke link'}
                        className="p-1.5 rounded-md text-[#ff8389] hover:bg-[#da1e28]/15"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--cds-text-03,#8d8d8d)]">
                    <span>{inv.useCount}{inv.maxUses ? `/${inv.maxUses}` : ''} {isAr ? 'استخدام' : 'uses'}</span>
                    <span>·</span>
                    <span>{inv.revoked ? (isAr ? 'ملغى' : 'revoked') : new Date(inv.expiresAt) <= new Date() ? (isAr ? 'منتهي' : 'expired') : `${isAr ? 'ينتهي' : 'expires'} ${new Date(inv.expiresAt).toLocaleDateString()}`}</span>
                  </div>
                </div>
              );
            })}

            {/* ===== Email invites (for unregistered people) ===== */}
            {emailInvites.length > 0 && (
              <div className="pt-2 border-t border-[var(--cds-border-subtle,#393939)]">
                <p className="text-[11px] font-semibold text-[var(--cds-text-02,#c6c6c6)] flex items-center gap-1.5 mb-2">
                  <Mail className="w-3.5 h-3.5 text-[#0f62fe]" />
                  {isAr ? 'دعوات بالبريد (لغير المسجلين)' : 'Email invites (unregistered)'}
                </p>
                <div className="space-y-2">
                  {emailInvites.map(einv => {
                    const statusMeta: Record<EmailInviteRow['status'], { label: string; cls: string }> = isAr
                      ? {
                          pending: { label: 'معلّقة', cls: 'text-[#f1c21b]' },
                          consumed: { label: `انضم${einv.consumedByName ? `: ${einv.consumedByName}` : ''}`, cls: 'text-[#42be65]' },
                          expired: { label: 'منتهية', cls: 'text-[var(--cds-text-03,#8d8d8d)]' },
                          revoked: { label: 'ملغاة', cls: 'text-[#ff8389]' },
                        }
                      : {
                          pending: { label: 'pending', cls: 'text-[#f1c21b]' },
                          consumed: { label: `joined${einv.consumedByName ? `: ${einv.consumedByName}` : ''}`, cls: 'text-[#42be65]' },
                          expired: { label: 'expired', cls: 'text-[var(--cds-text-03,#8d8d8d)]' },
                          revoked: { label: 'revoked', cls: 'text-[#ff8389]' },
                        };
                    const meta = statusMeta[einv.status];
                    return (
                      <div key={einv.code} className={`border rounded-lg p-2.5 ${einv.status === 'pending' ? 'border-[#f1c21b]/40 bg-[#f1c21b]/5' : 'border-[var(--cds-border-subtle,#393939)] opacity-70'}`}>
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-[11px] text-[var(--cds-text-01,#f4f4f4)] truncate" dir="ltr">{einv.invitedEmail}</span>
                          <span className={`text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                          {einv.status === 'pending' && (
                            <button
                              onClick={() => revokeEmailInvite(einv.code)}
                              disabled={busyCode === einv.code}
                              title={isAr ? 'إلغاء الدعوة' : 'Cancel invite'}
                              className="p-1.5 rounded-md text-[#ff8389] hover:bg-[#da1e28]/15 disabled:opacity-50"
                            >
                              {busyCode === einv.code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--cds-text-03,#8d8d8d)]">
                          <span>{new Date(einv.createdAt).toLocaleDateString()}</span>
                          <span>·</span>
                          <span>{isAr ? 'تنتهي' : 'expires'} {new Date(einv.expiresAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** Compact inline variant for the conversation header button. */
export const InviteButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button
    onClick={onClick}
    className="h-8 px-3 text-[11px] font-semibold rounded-lg bg-[#0f62fe] hover:bg-[#0353e9] text-white flex items-center gap-1.5"
  >
    <Crown className="w-3.5 h-3.5" />
    {label}
  </button>
);
