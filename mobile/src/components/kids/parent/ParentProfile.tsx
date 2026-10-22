// Gestion d'un profil enfant : temps par jour, catalogue autorisé, petites actions, modification / suppression.
// Écran du parent connecté (jeton normal) ; jamais accessible avec le jeton enfant (le serveur le refuse).
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { AVATARS, BANDS, KC, LIMIT_CHOICES, actionStateKey, allowedCount, avatarEmoji, bandKey, catalogIds, limitLabel, profilePatch, withAllowed } from '@/lib/kids';
import type { KidAction, KidActionCounts, KidControls, KidParentCatalog, KidProfileFull } from '@/lib/types';
import { Field } from '@/components/ui';
import { KButton, KChip, KTxt } from '@/components/kids/KidUi';

type Section = 'time' | 'catalog' | 'actions' | 'profile';
const fieldStyle = { backgroundColor: KC.surface2, borderColor: KC.line, borderWidth: 2, borderRadius: 18 };

export function ParentProfile({ profile, onChanged }: { profile: KidProfileFull; onChanged: () => void }) {
  const { t } = useSession();
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (s: Section) => setOpen(open === s ? null : s);
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: 24, backgroundColor: KC.surface, borderWidth: 2, borderColor: KC.line }}>
      <KTxt weight="extrabold" size={20} accessibilityRole="header">{avatarEmoji(profile.avatar)} {profile.name} <KTxt size={13} color={KC.muted}>· {t(bandKey(profile.band))}</KTxt></KTxt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <KChip label={`⏱ ${t('kcTime')}`} active={open === 'time'} onPress={() => toggle('time')} />
        <KChip label={`📚 ${t('kcCatalog')}`} active={open === 'catalog'} onPress={() => toggle('catalog')} />
        <KChip label={`🌱 ${t('kaTitle')}`} active={open === 'actions'} onPress={() => toggle('actions')} />
        <KChip label={`✏️ ${t('kdEdit')}`} active={open === 'profile'} onPress={() => toggle('profile')} />
      </View>
      {open === 'time' ? <TimeAndCatalogMode profile={profile} onChanged={onChanged} /> : null}
      {open === 'catalog' ? <CatalogList profile={profile} onChanged={onChanged} /> : null}
      {open === 'actions' ? <ActionsManager profile={profile} /> : null}
      {open === 'profile' ? <EditProfile profile={profile} onChanged={onChanged} /> : null}
    </View>
  );
}

function useFlash() {
  const [msg, setMsg] = useState('');
  const flash = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); }, []);
  return { msg, flash };
}

function TimeAndCatalogMode({ profile, onChanged }: { profile: KidProfileFull; onChanged: () => void }) {
  const { t, api } = useSession();
  const [c, setC] = useState<KidControls | null>(null);
  const { msg, flash } = useFlash();
  const base = `/me/kids/profiles/${profile.id}/controls`;
  const load = useCallback(() => api.get<KidControls>(base).then(setC).catch(() => setC(null)), [api, base]);
  useEffect(() => { void load(); }, [load]);
  if (!c) return <KTxt color={KC.text2}>…</KTxt>;
  const put = async (body: { dailyLimitMin?: number | null; catalogMode?: 'all' | 'selected' }) => {
    try { await api.put(base, body); flash(t('kcSaved')); await load(); onChanged(); } catch (e) { flash(e instanceof ApiError ? e.message : t('common.error')); }
  };
  return (
    <View style={{ gap: 10 }}>
      <KTxt weight="bold" color={KC.text2}>{t('kcTime')}</KTxt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LIMIT_CHOICES.map((m) => <KChip key={m ?? 'none'} label={limitLabel(m, t as never)} active={c.dailyLimitMin === m} onPress={() => c.dailyLimitMin !== m && void put({ dailyLimitMin: m })} />)}
      </View>
      <KTxt size={12} color={KC.muted}>{t('kcTimeHelp')} {t('kcUsedToday', { n: Math.round(c.usedSec / 60) })}</KTxt>
      <KTxt weight="bold" color={KC.text2}>{t('kcCatalog')}</KTxt>
      <View style={{ gap: 8 }}>
        <KChip label={t('kcModeAll')} active={c.catalogMode === 'all'} onPress={() => c.catalogMode !== 'all' && void put({ catalogMode: 'all' })} />
        <KChip label={t('kcModeSel')} active={c.catalogMode === 'selected'} onPress={() => c.catalogMode !== 'selected' && void put({ catalogMode: 'selected' })} />
      </View>
      <KTxt size={12} color={KC.muted}>{c.catalogMode === 'all' ? t('kcHelpAll') : t('kcHelpSel')}</KTxt>
      {msg ? <KTxt size={13} color={KC.ok} accessibilityRole="alert">{msg}</KTxt> : null}
    </View>
  );
}

function CatalogList({ profile, onChanged }: { profile: KidProfileFull; onChanged: () => void }) {
  const { t, api } = useSession();
  const [cat, setCat] = useState<KidParentCatalog | null>(null);
  const { msg, flash } = useFlash();
  const base = `/me/kids/profiles/${profile.id}/catalog`;
  const load = useCallback(() => api.get<KidParentCatalog>(base).then(setCat).catch(() => setCat(null)), [api, base]);
  useEffect(() => { void load(); }, [load]);
  if (!cat) return <KTxt color={KC.text2}>…</KTxt>;
  const set = async (ids: string[], allowed: boolean) => {
    if (!ids.length) return;
    setCat((x) => (x ? { ...x, talks: withAllowed(x.talks, ids, allowed) } : x)); // immédiat, annulé si le serveur refuse
    try { await api.put(base, { talkIds: ids, allowed }); flash(t('kcSaved')); onChanged(); } catch { flash(t('common.error')); await load(); }
  };
  const ids = catalogIds(cat.talks);
  return (
    <View style={{ gap: 10 }}>
      <KTxt size={12} color={KC.muted}>{cat.mode === 'all' ? t('kcHelpAll') : t('kcHelpSel')} · {allowedCount(cat.talks)} / {cat.talks.length}</KTxt>
      {cat.talks.length === 0 ? <KTxt color={KC.text2}>{t('kcEmpty')}</KTxt> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <KChip label={t('kcAllowAll')} onPress={() => void set(ids, true)} />
            <KChip label={t('kcBlockAll')} onPress={() => void set(ids, false)} />
          </View>
          {cat.talks.map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
              <Switch value={x.allowed} onValueChange={(v) => void set([x.id], v)} trackColor={{ true: KC.accent, false: KC.line }} accessibilityLabel={x.title} />
              <View style={{ flex: 1 }}><KTxt weight="bold">{x.title}</KTxt>{x.speaker ? <KTxt size={12} color={KC.muted}>{x.speaker}</KTxt> : null}</View>
            </View>
          ))}
        </>
      )}
      {msg ? <KTxt size={13} color={KC.ok} accessibilityRole="alert">{msg}</KTxt> : null}
    </View>
  );
}

function ActionsManager({ profile }: { profile: KidProfileFull }) {
  const { t, api } = useSession();
  const [d, setD] = useState<{ actions: KidAction[]; counts: KidActionCounts } | null>(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const base = `/me/kids/profiles/${profile.id}/actions`;
  const load = useCallback(() => api.get<{ actions: KidAction[]; counts: KidActionCounts }>(base).then(setD).catch(() => setD(null)), [api, base]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => {
    setErr('');
    try { await api.post(base, { title: title.trim() }); setTitle(''); await load(); } catch (e) { setErr(e instanceof ApiError ? e.message : t('common.error')); }
  };
  const validate = async (id: string) => { try { await api.post(`${base}/${id}/validate`); await load(); } catch { setErr(t('common.error')); } };
  const remove = async (id: string) => { try { await api.del(`${base}/${id}`); await load(); } catch { setErr(t('common.error')); } };
  return (
    <View style={{ gap: 10 }}>
      <KTxt size={12} color={KC.muted}>{t('kaParentHelp')}</KTxt>
      <Field label={t('kaPropose')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('kaPlaceholder')} style={fieldStyle} />
      <KButton label={t('kaAdd')} disabled={!title.trim()} onPress={() => void add()} />
      {err ? <KTxt color={KC.danger} accessibilityRole="alert">{err}</KTxt> : null}
      {d && d.actions.length === 0 ? <KTxt color={KC.text2}>{t('kaParentNone')}</KTxt> : null}
      {d?.actions.map((a) => (
        <View key={a.id} style={{ gap: 6, padding: 12, borderRadius: 16, backgroundColor: KC.surface2, borderWidth: 1, borderColor: a.status === 'claimed' ? KC.accent : KC.line }}>
          <KTxt weight="bold">{a.title}</KTxt>
          <KTxt size={12} color={a.status === 'claimed' ? KC.accent : KC.muted}>{t(actionStateKey(a.status) as never)}</KTxt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {a.status !== 'validated' ? <KChip label={t('kaValidate')} active={a.status === 'claimed'} onPress={() => void validate(a.id)} /> : null}
            <KChip label={t('kids.delete')} onPress={() => void remove(a.id)} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EditProfile({ profile, onChanged }: { profile: KidProfileFull; onChanged: () => void }) {
  const { t, api } = useSession();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [band, setBand] = useState(profile.band);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const patch = profilePatch(profile, { name, avatar, band });
  const save = async () => {
    if (!patch) return;
    setMsg(null);
    try { await api.patch(`/me/kids/profiles/${profile.id}`, patch); setMsg({ text: t('kcSaved'), ok: true }); onChanged(); }
    catch (e) { setMsg({ text: e instanceof ApiError && e.code === 'duplicate' ? t('kdDuplicate') : e instanceof ApiError ? e.message : t('common.error'), ok: false }); }
  };
  const remove = () => Alert.alert(t('kdProfiles'), t('kdDeleteConfirm', { name: profile.name }), [
    { text: t('kdCancel'), style: 'cancel' },
    { text: t('kids.delete'), style: 'destructive', onPress: () => { void api.del(`/me/kids/profiles/${profile.id}`).then(onChanged).catch(() => setMsg({ text: t('common.error'), ok: false })); } },
  ]);
  return (
    <View style={{ gap: 10 }}>
      <Field label={t('kdName')} value={name} onChangeText={setName} maxLength={30} style={fieldStyle} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {AVATARS.map((a) => (
          <Pressable key={a} accessibilityRole="button" accessibilityState={{ selected: avatar === a }} accessibilityLabel={a} onPress={() => setAvatar(a)}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: avatar === a ? KC.accent : KC.surface2, borderWidth: 2, borderColor: avatar === a ? KC.accent : KC.line }}>
            <KTxt size={24} style={{ lineHeight: 30 }}>{avatarEmoji(a)}</KTxt>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{BANDS.map((b) => <KChip key={b} label={t(bandKey(b))} active={band === b} onPress={() => setBand(b)} />)}</View>
      {msg ? <KTxt color={msg.ok ? KC.ok : KC.danger} accessibilityRole="alert">{msg.text}</KTxt> : null}
      <KButton label={t('save')} disabled={!patch} onPress={() => void save()} />
      <KButton label={t('kids.delete')} variant="ghost" onPress={remove} />
    </View>
  );
}
