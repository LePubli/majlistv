// Fenêtre « Ajouter à une liste » : coche / décoche les listes qui contiennent la conférence, ou crée une nouvelle liste.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import type { ListsResponse } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Button, ErrorBox, Field, Loading, Txt } from './ui';

export function AddToListModal({ talkId, visible, onClose }: { talkId: string; visible: boolean; onClose: () => void }) {
  const { api, t, dirStyle } = useSession();
  const [lists, setLists] = useState<ListsResponse | null>(null);
  const [inside, setInside] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setFailed(false);
    try {
      const [l, ids] = await Promise.all([api.get<ListsResponse>('/me/lists'), api.get<string[]>(`/me/lists/containing/${talkId}`)]);
      setLists(l);
      setInside(new Set(ids));
    } catch { setFailed(true); }
  }
  useEffect(() => { if (visible) void load(); }, [visible, talkId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(listId: string) {
    const has = inside.has(listId);
    const next = new Set(inside);
    if (has) next.delete(listId); else next.add(listId);
    setInside(next); // affichage immédiat, annulé si le serveur refuse
    try {
      if (has) await api.del(`/me/lists/${listId}/items/${talkId}`); else await api.put(`/me/lists/${listId}/items/${talkId}`);
    } catch { setInside(inside); setMsg(t('common.error')); }
  }

  async function create() {
    const title = name.trim();
    if (!title) return;
    setMsg('');
    try {
      const l = await api.post<{ id: string }>('/me/lists', { title });
      await api.put(`/me/lists/${l.id}/items/${talkId}`);
      setName('');
      await load();
    } catch (e) { setMsg(e instanceof ApiError && e.code === 'limit' ? t('lib.limit') : t('common.error')); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('common.close')} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      <View style={[{ maxHeight: '75%', backgroundColor: colors.panel, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, padding: 18, gap: 14, borderTopWidth: 1, borderColor: colors.border }, dirStyle]}>
        <Txt weight="extrabold" size={18}>{t('lib.addToList')}</Txt>
        {failed ? <ErrorBox onRetry={load} /> : !lists ? <View style={{ height: 100 }}><Loading /></View> : (
          <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {lists.lists.map((l) => {
              const on = inside.has(l.id);
              return (
                <Pressable key={l.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(l.id)}
                  style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: radius.card, borderWidth: 1,
                    borderColor: on ? colors.goldLine : colors.border, backgroundColor: on ? colors.goldTint : colors.panel2 }}>
                  <Feather name={on ? 'check-square' : 'square'} size={20} color={on ? colors.goldLight : colors.muted} />
                  <Txt weight="semibold" style={{ flex: 1 }} numberOfLines={1}>{l.title}</Txt>
                  <Txt size={12} color={colors.muted}>{l.items}</Txt>
                </Pressable>
              );
            })}
            <Field label={t('lib.newList')} value={name} onChangeText={setName} maxLength={100} onSubmitEditing={create} returnKeyType="done" />
            <Button label={t('lib.create')} variant="dark" onPress={create} disabled={!name.trim()} />
            {msg ? <Txt color={colors.danger} accessibilityRole="alert">{msg}</Txt> : null}
          </ScrollView>
        )}
        <Button label={t('common.close')} onPress={onClose} />
      </View>
    </Modal>
  );
}
