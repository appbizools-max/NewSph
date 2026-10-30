import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  Dimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import {
  getSafeDb,
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
} from '../../../utils/firebaseSafe';

export interface MobileClinicFolder {
  id?: string;
  name: string;
  description?: string;
  color?: string;
  itemCount?: number;
  createdBy?: string;
  createdAt?: string;
}

export interface MobileMediaLink {
  id?: string;
  folderId?: string;
  folderName?: string;
  title: string;
  url: string;
  category: string;
  notes?: string;
  uploadedBy?: string;
  createdAt?: string;
}

const CATEGORY_OPTIONS = [
  { id: 'diet_lifestyle', label: 'Diet & Lifestyle', color: '#16a34a', bg: '#dcfce7' },
  { id: 'exercises', label: 'Exercises & Yoga', color: '#0284c7', bg: '#e0f2fe' },
  { id: 'awareness', label: 'General Awareness', color: '#9333ea', bg: '#f3e8ff' },
  { id: 'lab_reports', label: 'Lab & Diagnostic Links', color: '#ea580c', bg: '#ffedd5' },
  { id: 'clinic_media', label: 'Clinic Media & Guides', color: '#475569', bg: '#f1f5f9' },
];

const FOLDER_COLORS = ['#0284c7', '#16a34a', '#9333ea', '#ea580c', '#e11d48', '#0d9488'];

export const MediaManagerScreen: React.FC = () => {
  const db = getSafeDb();

  const [folders, setFolders] = useState<MobileClinicFolder[]>([]);
  const [mediaItems, setMediaItems] = useState<MobileMediaLink[]>([]);
  const [currentFolder, setCurrentFolder] = useState<MobileClinicFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Folder Modal State
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [savingFolder, setSavingFolder] = useState(false);

  // Add Link Modal State
  const [addLinkModalOpen, setAddLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [savingLink, setSavingLink] = useState(false);

  // 1. Subscribe to folders
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    try {
      const q = collection(db, 'clinic_media_folders');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: MobileClinicFolder[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...d.data() } as MobileClinicFolder);
          });
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setFolders(list);
          setLoading(false);
        },
        (err) => {
          console.warn('Folders snapshot error:', err);
          setLoading(false);
        }
      );
      return () => unsub();
    } catch (e) {
      setLoading(false);
    }
  }, [db]);

  // 2. Subscribe to media items
  useEffect(() => {
    if (!db) return;

    try {
      const q = collection(db, 'clinic_media_items');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: MobileMediaLink[] = [];
          snap.forEach((d) => {
            list.push({ id: d.id, ...d.data() } as MobileMediaLink);
          });
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setMediaItems(list);
        },
        (err) => {
          console.warn('Media items snapshot error:', err);
        }
      );
      return () => unsub();
    } catch (e) { }
  }, [db]);

  // Calculate items count per folder
  const folderCounts = useMemo(() => {
    const map: Record<string, number> = {};
    mediaItems.forEach((item) => {
      const fId = item.folderId || 'root';
      map[fId] = (map[fId] || 0) + 1;
    });
    return map;
  }, [mediaItems]);

  // Filtered Items for active view
  const currentFolderItems = useMemo(() => {
    if (!currentFolder) return [];
    return mediaItems.filter((i) => (i.folderId || 'root') === (currentFolder.id || 'root'));
  }, [currentFolder, mediaItems]);

  const searchFilteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return currentFolder ? currentFolderItems : mediaItems;
    return (currentFolder ? currentFolderItems : mediaItems).filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.url?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q)
    );
  }, [searchQuery, currentFolder, currentFolderItems, mediaItems]);

  // Handle Create Folder
  const handleCreateFolder = async () => {
    const cleanName = folderName.trim();
    if (!cleanName) {
      Alert.alert('Required', 'Please enter a folder name.');
      return;
    }
    if (!db) return;

    setSavingFolder(true);
    try {
      await addDoc(collection(db, 'clinic_media_folders'), {
        name: cleanName,
        description: folderDesc.trim(),
        color: folderColor,
        createdBy: 'Reception',
        createdAt: new Date().toISOString(),
      });
      setFolderName('');
      setFolderDesc('');
      setFolderColor(FOLDER_COLORS[0]);
      setCreateFolderModalOpen(false);
      Alert.alert('Folder Created', `Folder "${cleanName}" has been created.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create folder');
    } finally {
      setSavingFolder(false);
    }
  };

  // Handle Add Media Link (Web Link Only)
  const handleAddMediaLink = async () => {
    let cleanUrl = linkUrl.trim();

    if (!cleanUrl) {
      Alert.alert('Required', 'Please enter a valid web link / URL.');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    if (!db) return;

    setSavingLink(true);
    try {
      await addDoc(collection(db, 'clinic_media_items'), {
        folderId: currentFolder?.id || 'root',
        folderName: currentFolder?.name || 'General Media',
        title: cleanUrl,
        url: cleanUrl,
        type: 'url',
        uploadedBy: 'Reception',
        createdAt: new Date().toISOString(),
      });
      setLinkUrl('');
      setAddLinkModalOpen(false);
      Alert.alert('Link Added', 'Web link saved in folder successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add web link');
    } finally {
      setSavingLink(false);
    }
  };

  // Delete Media Link
  const handleDeleteLink = (item: MobileMediaLink) => {
    Alert.alert('Delete Link', `Are you sure you want to delete "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!db || !item.id) return;
          try {
            await deleteDoc(doc(db, 'clinic_media_items', item.id));
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not delete item');
          }
        },
      },
    ]);
  };

  // Delete Folder
  const handleDeleteFolder = (f: MobileClinicFolder) => {
    Alert.alert('Delete Folder', `Delete folder "${f.name}" and all its saved links?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!db || !f.id) return;
          try {
            await deleteDoc(doc(db, 'clinic_media_folders', f.id));
            if (currentFolder?.id === f.id) {
              setCurrentFolder(null);
            }
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not delete folder');
          }
        },
      },
    ]);
  };

  // Open external link
  const handleOpenLink = (url: string) => {
    if (!url) return;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Cannot Open', 'No browser available to open this link: ' + url);
        }
      })
      .catch(() => {
        Linking.openURL(url).catch(() => Alert.alert('Invalid URL', url));
      });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {currentFolder && (
              <TouchableOpacity onPress={() => setCurrentFolder(null)} style={{ padding: 4, marginRight: 2 }}>
                <Ionicons name="arrow-back" size={20} color="#0f172a" />
              </TouchableOpacity>
            )}
            <Text style={styles.title} numberOfLines={1}>
              {currentFolder ? currentFolder.name : 'Media Manager'}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {currentFolder
              ? `${currentFolderItems.length} media links in this folder`
              : 'Save & organize media links for doctor consultation sharing'}
          </Text>
        </View>

        {/* Action Button */}
        {currentFolder ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#0284c7' }]}
            onPress={() => setAddLinkModalOpen(true)}
          >
            <Feather name="plus" size={15} color="#ffffff" />
            <Text style={styles.primaryBtnText}>Add Link</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#0284c7' }]}
            onPress={() => setCreateFolderModalOpen(true)}
          >
            <Feather name="folder-plus" size={15} color="#ffffff" />
            <Text style={styles.primaryBtnText}>New Folder</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          placeholder={currentFolder ? `Search in ${currentFolder.name}...` : 'Search media links & folders...'}
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>Loading media library...</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* FOLDERS GRID (when not inside a specific folder and not searching directly) */}
          {!currentFolder && searchQuery.trim().length === 0 && (
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={styles.sectionHeading}>Folders ({folders.length})</Text>
                <TouchableOpacity onPress={() => setCreateFolderModalOpen(true)}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284c7' }}>+ Create Folder</Text>
                </TouchableOpacity>
              </View>

              {folders.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Feather name="folder" size={32} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>No Media Folders Yet</Text>
                  <Text style={styles.emptySub}>
                    Create folders like "Diet Videos", "Exercise Routines", or "Doctor Advice" to save media links.
                  </Text>
                  <TouchableOpacity style={styles.emptyActionBtn} onPress={() => setCreateFolderModalOpen(true)}>
                    <Text style={styles.emptyActionText}>+ Create First Folder</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.foldersGrid}>
                  {folders.map((f) => {
                    const count = folderCounts[f.id || ''] || 0;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.folderCard, { borderLeftColor: f.color || '#0284c7' }]}
                        activeOpacity={0.7}
                        onPress={() => setCurrentFolder(f)}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={[styles.folderIconBox, { backgroundColor: (f.color || '#0284c7') + '20' }]}>
                            <Ionicons name="folder" size={22} color={f.color || '#0284c7'} />
                          </View>
                          <TouchableOpacity onPress={() => handleDeleteFolder(f)} style={{ padding: 4 }}>
                            <Feather name="trash-2" size={14} color="#94a3b8" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.folderName} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.folderCount}>{count} {count === 1 ? 'Link' : 'Links'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* MEDIA ITEMS LIST */}
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.sectionHeading}>
                {currentFolder
                  ? `Saved Links in ${currentFolder.name} (${searchFilteredItems.length})`
                  : searchQuery.trim().length > 0
                    ? `Search Results (${searchFilteredItems.length})`
                    : `All Saved Media Links (${mediaItems.length})`}
              </Text>
              {currentFolder && (
                <TouchableOpacity onPress={() => setAddLinkModalOpen(true)}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284c7' }}>+ Add Link</Text>
                </TouchableOpacity>
              )}
            </View>

            {searchFilteredItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="link-outline" size={32} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No Media Links</Text>
                <Text style={styles.emptySub}>
                  {currentFolder
                    ? `No links added to "${currentFolder.name}" yet. Add YouTube, Google Drive, or article links here.`
                    : 'No media links saved in the clinic repository.'}
                </Text>
                {currentFolder && (
                  <TouchableOpacity style={styles.emptyActionBtn} onPress={() => setAddLinkModalOpen(true)}>
                    <Text style={styles.emptyActionText}>+ Add Media Link</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {searchFilteredItems.map((item) => {
                  const cat = CATEGORY_OPTIONS.find((c) => c.id === item.category) || CATEGORY_OPTIONS[0];
                  const isYouTube = item.url.includes('youtube.com') || item.url.includes('youtu.be');
                  const isDrive = item.url.includes('drive.google.com') || item.url.includes('docs.google.com');

                  return (
                    <View key={item.id} style={styles.linkCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                        <View style={[styles.linkIconBox, { backgroundColor: cat.bg }]}>
                          {isYouTube ? (
                            <MaterialCommunityIcons name="youtube" size={24} color="#dc2626" />
                          ) : isDrive ? (
                            <MaterialCommunityIcons name="google-drive" size={22} color="#16a34a" />
                          ) : (
                            <Feather name="link-2" size={20} color={cat.color} />
                          )}
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={styles.linkTitle} numberOfLines={1}>{item.url}</Text>
                            <TouchableOpacity onPress={() => handleDeleteLink(item)} style={{ padding: 4 }}>
                              <Feather name="trash-2" size={13} color="#94a3b8" />
                            </TouchableOpacity>
                          </View>

                          {item.folderName ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 3 }}>
                              <Text style={styles.folderTag}>📁 {item.folderName}</Text>
                            </View>
                          ) : null}

                          {/* Action Buttons */}
                          <View style={styles.linkActionRow}>
                            <TouchableOpacity
                              style={[styles.smallBtn, { backgroundColor: '#0284c7' }]}
                              onPress={() => handleOpenLink(item.url)}
                            >
                              <Feather name="external-link" size={12} color="#ffffff" />
                              <Text style={styles.smallBtnText}>Open Link</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.smallBtn, { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }]}
                              onPress={() => {
                                Alert.alert('Web Link', item.url, [
                                  { text: 'Open in Browser', onPress: () => handleOpenLink(item.url) },
                                  { text: 'OK' },
                                ]);
                              }}
                            >
                              <Feather name="copy" size={12} color="#475569" />
                              <Text style={[styles.smallBtnText, { color: '#475569' }]}>View URL</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* CREATE FOLDER MODAL */}
      <Modal visible={createFolderModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Folder</Text>
              <TouchableOpacity onPress={() => setCreateFolderModalOpen(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12, marginVertical: 14 }}>
              <View>
                <Text style={styles.inputLabel}>Folder Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Diet & Nutrition Videos"
                  placeholderTextColor="#94a3b8"
                  value={folderName}
                  onChangeText={setFolderName}
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>Description (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Patient lifestyle guides and tips"
                  placeholderTextColor="#94a3b8"
                  value={folderDesc}
                  onChangeText={setFolderDesc}
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>Folder Accent Color</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {FOLDER_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setFolderColor(c)}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: c },
                        folderColor === c && styles.colorCircleSelected,
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#f1f5f9' }]}
                onPress={() => setCreateFolderModalOpen(false)}
              >
                <Text style={[styles.modalBtnText, { color: '#475569' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#0284c7' }]}
                disabled={savingFolder}
                onPress={handleCreateFolder}
              >
                {savingFolder ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#ffffff' }]}>Create Folder</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD MEDIA LINK MODAL */}
      <Modal visible={addLinkModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add Web Link {currentFolder ? `to ${currentFolder.name}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setAddLinkModalOpen(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12, marginVertical: 14 }}>
              <View>
                <Text style={styles.inputLabel}>Web Link / URL *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="https://youtube.com/... or Google Drive link"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="url"
                  autoFocus
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#f1f5f9' }]}
                onPress={() => setAddLinkModalOpen(false)}
              >
                <Text style={[styles.modalBtnText, { color: '#475569' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#0284c7' }]}
                disabled={savingLink}
                onPress={handleAddMediaLink}
              >
                {savingLink ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#ffffff' }]}>Save Link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 0,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  folderCard: {
    width: (Dimensions.get('window').width - 42) / 2,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    padding: 12,
    gap: 6,
  },
  folderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  folderCount: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  linkCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  linkIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  folderTag: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '600',
  },
  linkNotes: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 2,
  },
  urlPreview: {
    fontSize: 11,
    color: '#0284c7',
    marginTop: 4,
  },
  linkActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyActionBtn: {
    marginTop: 10,
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyActionText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#0f172a',
  },
  categorySelectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  categorySelectChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    marginTop: 6,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
});
