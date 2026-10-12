// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { pickBestVoice, applyBestVoice } from '../bestVoice';

const mkVoice = (name: string, lang: string, localService = true): SpeechSynthesisVoice =>
  ({ name, lang, localService, default: false, voiceURI: name }) as unknown as SpeechSynthesisVoice;

const fakeSynth = (voices: SpeechSynthesisVoice[]) => ({ getVoices: () => voices }) as unknown as SpeechSynthesis;

describe('pickBestVoice — best Arabic/English system-voice auto-pick', () => {
  let consoleSilenced: typeof console.warn;
  beforeEach(() => {
    consoleSilenced = console.warn;
    console.warn = () => {};
  });

  it('returns null when no voices at all', () => {
    expect(pickBestVoice('ar-SA', fakeSynth([]))).toBeNull();
  });

  it('picks the high-quality Arabic engine over a plain Arabic one', () => {
    const maged = mkVoice('Microsoft Majed (Arabic)', 'ar-SA', true);
    const plain = mkVoice('Arabic Generic Voice', 'ar-EG', true);
    const picked = pickBestVoice('ar-SA', fakeSynth([plain, maged]));
    expect(picked?.name).toContain('Majed');
  });

  it('prefers exact dialect match (ar-SA) over other Arabic voices when equal quality', () => {
    const naayf = mkVoice('Naayf', 'ar-SA', true);
    const google = mkVoice('Google Arabic', 'ar-EG', true);
    const picked = pickBestVoice('ar-SA', fakeSynth([google, naayf]));
    // Naayf: 100 (engine) + 30 (local) + 25 (exact) = 155 > Google: 55 + 30 + 0 = 85
    expect(picked?.name).toBe('Naayf');
  });

  it('falls back to any ar-prefixed voice when no high-quality engine exists', () => {
    const fallback = mkVoice('Unknown Arabic Voice', 'ar-JO', false);
    const picked = pickBestVoice('ar-SA', fakeSynth([fallback]));
    expect(picked?.lang).toBe('ar-JO');
  });

  it('returns null when only English voices exist for an Arabic request', () => {
    const en = mkVoice('Microsoft Aria', 'en-US');
    expect(pickBestVoice('ar-SA', fakeSynth([en]))).toBeNull();
  });

  it('matches voice name “عربي” in Arabic even with non-ar lang tag', () => {
    const odd = mkVoice('صوت عربي', 'ar-XA', true);
    const picked = pickBestVoice('ar-SA', fakeSynth([odd]));
    expect(picked).not.toBeNull();
  });

  it('applyBestVoice sets voice and langs when found, leaves utterance otherwise', () => {
    const majed = mkVoice('Majed (Arabic Saudi)', 'ar-SA', true);
    const u1 = { lang: 'ar-SA' } as SpeechSynthesisUtterance;
    applyBestVoice(u1, 'ar-SA', fakeSynth([majed]));
    expect(u1.voice?.name).toContain('Majed');
    expect(u1.lang).toBe('ar-SA');

    const u2 = { lang: 'ar-SA' } as SpeechSynthesisUtterance;
    applyBestVoice(u2, 'ar-SA', fakeSynth([]));
    expect(u2.voice).toBeUndefined();
    expect(u2.lang).toBe('ar-SA');
  });

  it('English mode removes Arabic voices and picks an English engine', () => {
    const aria = mkVoice('Microsoft Aria Online (Natural) - English', 'en-US', false);
    const ar = mkVoice('Majed Arabic', 'ar-SA', true);
    const picked = pickBestVoice('en-US', fakeSynth([ar, aria]));
    expect(picked?.name).toContain('Aria');
  });
});
