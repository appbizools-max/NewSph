import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  FolderPlus,
  Link as LinkIcon,
  ExternalLink,
  Plus,
  Search,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  ArrowLeft,
  X,
  AlertCircle
} from 'lucide-react';
import {
  ClinicFolder,
  ClinicMediaItem,
  createClinicFolder,
  subscribeToClinicFolders,
  deleteClinicFolder,
  addClinicMediaItem,
  subscribeToClinicMediaItems,
  deleteClinicMediaItem
} from '../../../services/mediaManagerService';

interface MediaManagerPageProps {
  currentBranch?: string;
  onNavigate?: (tab: string, data?: any) => void;
}

export const MediaManagerPage: React.FC<MediaManagerPageProps> = () => {
  // Folders & Items State
  const [folders, setFolders] = useState<ClinicFolder[]>([]);
  const [mediaItems, setMediaItems] = useState<ClinicMediaItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<ClinicFolder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isAddUrlOpen, setIsAddUrlOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Simple Create Folder Form: ONLY FOLDER NAME
  const [folderName, setFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Simple Add URL Form: ONLY NAME & URL
  const [urlName, setUrlName] = useState('');
  const [urlLink, setUrlLink] = useState('');
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Delete State
  const [itemToDelete, setItemToDelete] = useState<{ type: 'folder' | 'item'; id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Subscribe to Folders & Items from Firestore
  useEffect(() => {
    setIsLoading(true);
    const unsubFolders = subscribeToClinicFolders((fList) => {
      setFolders(fList);
      setIsLoading(false);
    });

    const unsubItems = subscribeToClinicMediaItems((iList) => {
      setMediaItems(iList);
    });

    return () => {
      unsubFolders();
      unsubItems();
    };
  }, []);

  // Update currentFolder reference if folders change
  useEffect(() => {
    if (currentFolder) {
      const updated = folders.find(f => f.id === currentFolder.id);
      if (updated) setCurrentFolder(updated);
    }
  }, [folders]);

  // Handle Create Folder (ONLY NAME)
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setFolderError('Please enter a folder name.');
      return;
    }

    setIsCreatingFolder(true);
    setFolderError(null);

    try {
      await createClinicFolder({
        name: folderName.trim(),
        createdBy: 'Staff'
      });

      setFolderName('');
      setIsNewFolderOpen(false);
    } catch (err: any) {
      setFolderError(err.message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Handle Add URL inside folder (ONLY WEB LINK)
  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = urlLink.trim();
    if (!cleanUrl) {
      setUrlError('Please enter the URL link.');
      return;
    }

    setIsSavingUrl(true);
    setUrlError(null);

    try {
      await addClinicMediaItem({
        folderId: currentFolder?.id || 'root',
        folderName: currentFolder?.name || 'General',
        title: cleanUrl,
        type: 'url',
        url: cleanUrl,
        category: 'lab_reports',
        recordDate: new Date().toISOString().split('T')[0],
        uploadedBy: 'Staff'
      });

      setUrlName('');
      setUrlLink('');
      setIsAddUrlOpen(false);
    } catch (err: any) {
      setUrlError(err.message || 'Failed to save URL');
    } finally {
      setIsSavingUrl(false);
    }
  };

  // Copy URL to Clipboard
  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      if (itemToDelete.type === 'folder') {
        await deleteClinicFolder(itemToDelete.id);
        if (currentFolder?.id === itemToDelete.id) {
          setCurrentFolder(null);
        }
      } else {
        await deleteClinicMediaItem(itemToDelete.id);
      }
      setItemToDelete(null);
    } catch (e) {
      console.error('Delete error', e);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered Folders
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    return folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase().trim()));
  }, [folders, searchQuery]);

  // Filtered URLs inside current folder
  const currentFolderUrls = useMemo(() => {
    if (!currentFolder) return [];
    let list = mediaItems.filter(i => i.folderId === currentFolder.id);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(i => i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q));
    }
    return list;
  }, [mediaItems, currentFolder, searchQuery]);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Header Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
            padding: '12px',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
          }}>
            <Folder size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Media Manager
            </h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
              Create folders and store report & media URLs
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {currentFolder ? (
            <button
              onClick={() => setIsAddUrlOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
              }}
            >
              <Plus size={15} /> + Store URL in this Folder
            </button>
          ) : (
            <button
              onClick={() => setIsNewFolderOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
              }}
            >
              <FolderPlus size={16} /> Create New Folder
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb Navigation & Search Bar */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '12px 18px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
          <button
            onClick={() => setCurrentFolder(null)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: currentFolder ? '#0284c7' : '#0f172a',
              fontWeight: currentFolder ? 600 : 800,
              cursor: currentFolder ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Folder size={15} color={currentFolder ? '#0284c7' : '#0f172a'} />
            Folders ({folders.length})
          </button>

          {currentFolder && (
            <>
              <ChevronRight size={14} color="#94a3b8" />
              <span style={{ fontWeight: 800, color: '#0f172a' }}>
                {currentFolder.name}
              </span>
            </>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder={currentFolder ? "Search URLs in this folder..." : "Search folders..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. ALL FOLDERS VIEW (When no folder is opened) */}
      {/* ========================================================================= */}
      {!currentFolder ? (
        <div>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              Loading folders...
            </div>
          ) : filteredFolders.length === 0 ? (
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '48px 20px',
              textAlign: 'center'
            }}>
              <Folder size={42} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: '0 0 6px 0' }}>
                No Folders Yet
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
                Click below to create your first folder.
              </p>
              <button
                onClick={() => setIsNewFolderOpen(true)}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Create New Folder
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '16px'
            }}>
              {filteredFolders.map((folder) => {
                const count = mediaItems.filter(i => i.folderId === folder.id).length;
                return (
                  <div
                    key={folder.id}
                    onClick={() => setCurrentFolder(folder)}
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      border: '1px solid #e2e8f0',
                      padding: '18px 20px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,0.06)';
                      e.currentTarget.style.borderColor = '#0284c7';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{
                        background: '#e0f2fe',
                        padding: '12px',
                        borderRadius: '12px'
                      }}>
                        <Folder size={26} color="#0284c7" />
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToDelete({ type: 'folder', id: folder.id!, name: folder.name });
                        }}
                        title="Delete Folder"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                      {folder.name}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: '#64748b',
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '10px',
                      marginTop: '10px'
                    }}>
                      <span>{count} URLs stored</span>
                      <span style={{ color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                        Open <ChevronRight size={13} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. INSIDE FOLDER VIEW (Showing stored URLs) */
        /* ========================================================================= */
        <div>
          {/* Back & Folder Title Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setCurrentFolder(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  padding: '6px 12px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <ArrowLeft size={13} /> Back to Folders
              </button>

              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                📁 {currentFolder.name} ({currentFolderUrls.length} URLs)
              </h2>
            </div>

            <button
              onClick={() => setIsAddUrlOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Plus size={14} /> + Add URL
            </button>
          </div>

          {/* URLs List / Cards */}
          {currentFolderUrls.length === 0 ? (
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px dashed #cbd5e1',
              padding: '48px 20px',
              textAlign: 'center'
            }}>
              <LinkIcon size={38} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
              <div style={{ fontWeight: 700, color: '#334155', fontSize: '15px' }}>
                No URLs in this folder yet
              </div>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '4px 0 16px 0' }}>
                Store a URL with a name inside this folder.
              </p>
              <button
                onClick={() => setIsAddUrlOpen(true)}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Add First URL
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {currentFolderUrls.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    gap: '12px'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      {item.title}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#64748b',
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: '3px'
                    }}>
                      {item.url}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: '#0284c7',
                        color: '#ffffff',
                        textDecoration: 'none',
                        padding: '6px 12px',
                        borderRadius: '7px',
                        fontSize: '12px',
                        fontWeight: 700,
                        boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
                      }}
                    >
                      <ExternalLink size={12} /> Open URL
                    </a>

                    <button
                      onClick={() => handleCopy(item.url, item.id!)}
                      title="Copy URL"
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        color: copiedId === item.id ? '#16a34a' : '#475569',
                        padding: '6px 10px',
                        borderRadius: '7px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === item.id ? 'Copied' : 'Copy'}
                    </button>

                    <button
                      onClick={() => setItemToDelete({ type: 'item', id: item.id!, name: item.title })}
                      title="Delete URL"
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        padding: '6px 8px',
                        borderRadius: '7px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE NEW FOLDER (ONLY ONE FIELD: FOLDER NAME) */}
      {/* ========================================================================= */}
      {isNewFolderOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Create New Folder
              </h3>
              <button
                onClick={() => setIsNewFolderOpen(false)}
                style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '7px', cursor: 'pointer' }}
              >
                <X size={16} color="#64748b" />
              </button>
            </div>

            {folderError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '8px', color: '#b91c1c', fontSize: '12.5px', marginBottom: '12px' }}>
                {folderError}
              </div>
            )}

            <form onSubmit={handleCreateFolder}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Folder Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="Enter folder name..."
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #0284c7',
                    fontSize: '13.5px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isCreatingFolder ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isCreatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: STORE URL IN FOLDER (ONLY TWO FIELDS: NAME & URL) */}
      {/* ========================================================================= */}
      {isAddUrlOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Store URL
                </h3>
                {currentFolder && (
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>
                    Saving into: <strong>{currentFolder.name}</strong>
                  </p>
                )}
              </div>
              <button
                onClick={() => setIsAddUrlOpen(false)}
                style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '7px', cursor: 'pointer' }}
              >
                <X size={16} color="#64748b" />
              </button>
            </div>

            {urlError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '8px', color: '#b91c1c', fontSize: '12.5px', marginBottom: '12px' }}>
                {urlError}
              </div>
            )}

            <form onSubmit={handleAddUrl}>
              {/* Only Field: Web Link (URL) */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Web Link (URL) *
                </label>
                <input
                  type="url"
                  autoFocus
                  required
                  placeholder="https://drive.google.com/... or any web link"
                  value={urlLink}
                  onChange={(e) => setUrlLink(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #0284c7',
                    fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddUrlOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingUrl}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: isSavingUrl ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSavingUrl ? 'Saving...' : 'Store URL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {itemToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '380px',
            padding: '24px',
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0' }}>
              Delete {itemToDelete.type === 'folder' ? 'Folder' : 'URL'}?
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px 0' }}>
              Delete <strong>"{itemToDelete.name}"</strong>?
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <button
                onClick={() => setItemToDelete(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                style={{
                  padding: '8px 18px',
                  borderRadius: '7px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isDeleting ? 'not-allowed' : 'pointer'
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
