"use client";

import React, { useEffect, useState } from 'react';
import { MigrationRecord, MediaReference, SanityPostContent, SanityPageContent } from '../types/migration';
import { blockContentToHtml, getTextFromBlockContent } from '../utils/block-content-to-html';

// Function to process content and replace local paths with API URLs
const processContentForPreview = (content: string, mediaRefs: MediaReference[]): string => {
  let processedContent = content;
  
  // First, let's find all image, audio, and video tags in the content
  // and replace their src attributes with API URLs
  
  // Replace img src attributes
  processedContent = processedContent.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match: string, before: string, src: string, after: string) => {
      // Check if this src matches any of our media references
      const mediaRef = mediaRefs.find(ref => {
        // The src might be a relative path that matches our localPath
        return ref.localPath && (
          src === ref.localPath || 
          src.endsWith(ref.localPath) ||
          ref.localPath.endsWith(src)
        );
      });
      
      if (mediaRef && mediaRef.found) {
        const apiUrl = `/api/serve-media?path=${encodeURIComponent(mediaRef.localPath)}`;
        return `<img${before}src="${apiUrl}"${after}>`;
      }
      
      // If it starts with input/uploads, it's likely a local path
      if (src.startsWith('input/uploads/') || src.includes('/uploads/')) {
        const apiUrl = `/api/serve-media?path=${encodeURIComponent(src)}`;
        return `<img${before}src="${apiUrl}"${after}>`;
      }
      
      return match;
    }
  );
  
  // Replace audio src attributes
  processedContent = processedContent.replace(
    /<audio([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match: string, before: string, src: string, after: string) => {
      // Check if this src matches any of our media references
      const mediaRef = mediaRefs.find(ref => {
        return ref.localPath && ref.type === 'audio' && (
          src === ref.localPath || 
          src.endsWith(ref.localPath) ||
          ref.localPath.endsWith(src) ||
          src.replace(/\\/g, '/') === ref.localPath.replace(/\\/g, '/')
        );
      });
      
      if (mediaRef && mediaRef.found) {
        const apiUrl = `/api/serve-media?path=${encodeURIComponent(mediaRef.localPath)}`;
        return `<audio${before}src="${apiUrl}"${after}>`;
      }
      
      // Check if it's a local path (relative or absolute Windows/Unix path)
      if (src.startsWith('input/uploads/') || src.includes('/uploads/') || 
          src.match(/^[A-Za-z]:\\/) || src.startsWith('/')) {
        const apiUrl = `/api/serve-media?path=${encodeURIComponent(src)}`;
        return `<audio${before}src="${apiUrl}"${after}>`;
      }
      return match;
    }
  );
  
  // Replace video src attributes
  processedContent = processedContent.replace(
    /<video([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match: string, before: string, src: string, after: string) => {
      // Check if this src matches any of our media references
      const mediaRef = mediaRefs.find(ref => {
        return ref.localPath && ref.type === 'video' && (
          src === ref.localPath || 
          src.endsWith(ref.localPath) ||
          ref.localPath.endsWith(src) ||
          src.replace(/\\/g, '/') === ref.localPath.replace(/\\/g, '/')
        );
      });
      
      if (mediaRef && mediaRef.found) {
        const apiUrl = `/api/serve-media?path=${encodeURIComponent(mediaRef.localPath)}`;
        return `<video${before}src="${apiUrl}"${after}>`;
      }
      
      // Check if it's a local path (relative or absolute Windows/Unix path)
      if (src.startsWith('input/uploads/') || src.includes('/uploads/') || 
          src.match(/^[A-Za-z]:\\/) || src.startsWith('/')) {
        const apiUrl = `/api/serve-media?path=${encodeURIComponent(src)}`;
        return `<video${before}src="${apiUrl}"${after}>`;
      }
      return match;
    }
  );
  
  // Replace source src attributes (for audio/video elements)
  processedContent = processedContent.replace(
    /<source([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
    (match: string, before: string, src: string, after: string) => {
      // Check if it's a local path (relative or absolute Windows/Unix path)
      if (src.startsWith('input/uploads/') || src.includes('/uploads/') || 
          src.match(/^[A-Za-z]:\\/) || src.startsWith('/')) {
        const apiUrl = `/api/serve-media?path=${encodeURIComponent(src)}`;
        return `<source${before}src="${apiUrl}"${after}>`;
      }
      return match;
    }
  );
  
  return processedContent;
};


export const VerifyMigrationUI: React.FC = () => {
  const [records, setRecords] = useState<MigrationRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<MigrationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<{ [key: number]: boolean }>({});
  const [openData, setOpenData] = useState<{ [key: number]: boolean }>({});
  
  // Filter and search state
  const [searchTerm, setSearchTerm] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | 'post' | 'page'>('all');
  const [sortBy, setSortBy] = useState<'title' | 'date' | 'type'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    const loadMigrationData = async () => {
      try {
        const response = await fetch('/api/get-migration-data');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || data.details || `Failed to load migration data (Status: ${response.status})`);
        }

        if (!data.success) {
          throw new Error(data.error || data.details || 'Failed to load migration data');
        }

        setRecords(data.data);
        setFilteredRecords(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load migration data');
        console.error('Error loading migration data:', err);
      }
    };

    loadMigrationData();
  }, []);

  // Filter and sort records whenever filters change
  useEffect(() => {
    let filtered = [...records];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(record => {
        const title = record.transformed._type === 'post' 
          ? (record.transformed as SanityPostContent).title 
          : (record.transformed as SanityPageContent).name;
        const content = record.transformed._type === 'post' 
          ? getTextFromBlockContent((record.transformed as SanityPostContent).content)
          : (record.transformed as SanityPageContent).heading + ' ' + ((record.transformed as SanityPageContent).subheading || '');
        const slug = record.transformed.slug.current;
        
        return title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          content.toLowerCase().includes(searchTerm.toLowerCase()) ||
          slug.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    // Apply content type filter
    if (contentTypeFilter !== 'all') {
      filtered = filtered.filter(record => record.transformed._type === contentTypeFilter);
    }


    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'title':
          aValue = (a.transformed._type === 'post' 
            ? (a.transformed as SanityPostContent).title 
            : (a.transformed as SanityPageContent).name).toLowerCase();
          bValue = (b.transformed._type === 'post' 
            ? (b.transformed as SanityPostContent).title 
            : (b.transformed as SanityPageContent).name).toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.transformed._type === 'post' 
            ? (a.transformed as SanityPostContent).date || a.original.post_date
            : a.original.post_date).getTime();
          bValue = new Date(b.transformed._type === 'post' 
            ? (b.transformed as SanityPostContent).date || b.original.post_date
            : b.original.post_date).getTime();
          break;
        case 'type':
          aValue = a.transformed._type;
          bValue = b.transformed._type;
          break;
        default:
          aValue = (a.transformed._type === 'post' 
            ? (a.transformed as SanityPostContent).title 
            : (a.transformed as SanityPageContent).name).toLowerCase();
          bValue = (b.transformed._type === 'post' 
            ? (b.transformed as SanityPostContent).title 
            : (b.transformed as SanityPageContent).name).toLowerCase();
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      } else {
        return sortOrder === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);
      }
    });

    setFilteredRecords(filtered);
  }, [records, searchTerm, contentTypeFilter, sortBy, sortOrder]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Error Loading Migration Data</h1>
          <div className="space-y-4">
            <p className="text-red-200">{error}</p>
            {error.includes('details') && (
              <div className="mt-4">
                <h2 className="text-lg font-semibold text-red-300 mb-2">Technical Details:</h2>
                <pre className="bg-gray-900/50 p-4 rounded text-sm text-gray-300 overflow-auto">
                  {JSON.stringify(JSON.parse(error.split('details:')[1]), null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Statistics calculations
  const totalPosts = records.filter(r => r.transformed._type === 'post').length;
  const totalPages = records.filter(r => r.transformed._type === 'page').length;
  const totalMediaItems = records.reduce((sum, r) => sum + r.transformed.media.length, 0);
  const totalImages = records.reduce((sum, r) => sum + r.transformed.media.filter(m => m.type === 'image').length, 0);
  const totalAudio = records.reduce((sum, r) => sum + r.transformed.media.filter(m => m.type === 'audio').length, 0);
  const totalVideo = records.reduce((sum, r) => sum + r.transformed.media.filter(m => m.type === 'video').length, 0);
  const foundMedia = records.reduce((sum, r) => sum + r.transformed.media.filter(m => m.found).length, 0);
  const missingMedia = totalMediaItems - foundMedia;

  const handleSelectAll = () => {
    if (selectedItems.size === filteredRecords.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredRecords.map((_, index) => index)));
    }
  };

  const handleItemSelect = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const exportSelectedData = () => {
    const selectedData = filteredRecords.filter((_, index) => selectedItems.has(index));
    const dataStr = JSON.stringify(selectedData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `migration-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 min-h-screen bg-gray-900 text-gray-100">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Migration Verification UI</h1>
        <div className="flex gap-2">
          {selectedItems.size > 0 && (
            <button
              onClick={exportSelectedData}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
            >
              Export Selected ({selectedItems.size})
            </button>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Loading migration data...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Enhanced Statistics */}
          <div className="mb-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            <div className="bg-blue-900/50 border border-blue-700 rounded-lg p-4">
              <div className="text-blue-200 text-sm">Posts</div>
              <div className="text-2xl font-bold text-blue-100">{totalPosts}</div>
            </div>
            <div className="bg-green-900/50 border border-green-700 rounded-lg p-4">
              <div className="text-green-200 text-sm">Pages</div>
              <div className="text-2xl font-bold text-green-100">{totalPages}</div>
            </div>
            <div className="bg-purple-900/50 border border-purple-700 rounded-lg p-4">
              <div className="text-purple-200 text-sm">Images</div>
              <div className="text-2xl font-bold text-purple-100">{totalImages}</div>
            </div>
            <div className="bg-orange-900/50 border border-orange-700 rounded-lg p-4">
              <div className="text-orange-200 text-sm">Audio</div>
              <div className="text-2xl font-bold text-orange-100">{totalAudio}</div>
            </div>
            <div className="bg-pink-900/50 border border-pink-700 rounded-lg p-4">
              <div className="text-pink-200 text-sm">Video</div>
              <div className="text-2xl font-bold text-pink-100">{totalVideo}</div>
            </div>
            <div className="bg-indigo-900/50 border border-indigo-700 rounded-lg p-4">
              <div className="text-indigo-200 text-sm">Total Media</div>
              <div className="text-2xl font-bold text-indigo-100">{totalMediaItems}</div>
            </div>
            <div className="bg-emerald-900/50 border border-emerald-700 rounded-lg p-4">
              <div className="text-emerald-200 text-sm">Found</div>
              <div className="text-2xl font-bold text-emerald-100">{foundMedia}</div>
            </div>
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
              <div className="text-red-200 text-sm">Missing</div>
              <div className="text-2xl font-bold text-red-100">{missingMedia}</div>
            </div>
          </div>

          {/* Search and Filter Controls */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Search</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search title, content, or slug..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Content Type</label>
                <select
                  value={contentTypeFilter}
                  onChange={(e) => setContentTypeFilter(e.target.value as 'all' | 'post' | 'page')}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="post">Posts Only</option>
                  <option value="page">Pages Only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Sort By</label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'title' | 'date' | 'type')}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="title">Title</option>
                    <option value="date">Date</option>
                    <option value="type">Type</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-700">
              <div className="text-sm text-gray-300">
                Showing {filteredRecords.length} of {records.length} items
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-500 transition"
                >
                  {selectedItems.size === filteredRecords.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>
          </div>

          {/* Content Items */}
          {filteredRecords.map((record, index) => {
            const isDetailsOpen = openDetails[index] ?? false;
            const isDataOpen = openData[index] ?? false;
            const contentType = record.transformed._type;
            const isPage = contentType === 'page';
            const bgColor = isPage ? 'bg-green-800' : 'bg-blue-800';
            const borderColor = isPage ? 'border-green-700' : 'border-blue-700';
            const isSelected = selectedItems.has(index);
            
            return (
              <div
                key={index}
                className={`mb-6 border ${borderColor} rounded-lg p-6 ${bgColor} shadow transition-all duration-200 ${
                  isSelected ? 'ring-2 ring-purple-500' : ''
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleItemSelect(index)}
                    className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    isPage ? 'bg-green-600 text-green-100' : 'bg-blue-600 text-blue-100'
                  }`}>
                    {contentType.toUpperCase()}
                  </span>
                  <h2 className="text-xl font-semibold flex-1">
                    {record.transformed._type === 'post' ? (record.transformed as SanityPostContent).title : (record.transformed as SanityPageContent).name}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-gray-300">
                    {record.transformed.media.length > 0 && (
                      <div className="flex gap-1">
                        {record.transformed.media.filter(m => m.type === 'image').length > 0 && (
                          <span className="bg-purple-600 px-2 py-1 rounded text-xs">
                            {record.transformed.media.filter(m => m.type === 'image').length} img
                          </span>
                        )}
                        {record.transformed.media.filter(m => m.type === 'audio').length > 0 && (
                          <span className="bg-orange-600 px-2 py-1 rounded text-xs">
                            {record.transformed.media.filter(m => m.type === 'audio').length} audio
                          </span>
                        )}
                        {record.transformed.media.filter(m => m.type === 'video').length > 0 && (
                          <span className="bg-pink-600 px-2 py-1 rounded text-xs">
                            {record.transformed.media.filter(m => m.type === 'video').length} video
                          </span>
                        )}
                      </div>
                    )}
                    <span>{new Date(record.transformed._type === 'post' ? (record.transformed as SanityPostContent).date || '' : record.original.post_date).toLocaleDateString()}</span>
                  </div>
                </div>
                
                {/* Quick Preview */}
                <div className="mb-4 text-sm text-gray-300">
                  <div className="flex gap-4">
                    <span><strong>Slug:</strong> {record.transformed.slug.current}</span>
                    {record.transformed._type === 'post' && (record.transformed as SanityPostContent).excerpt && (
                      <span><strong>Excerpt:</strong> {(record.transformed as SanityPostContent).excerpt?.substring(0, 100)}...</span>
                    )}
                    {record.transformed._type === 'page' && (record.transformed as SanityPageContent).subheading && (
                      <span><strong>Subheading:</strong> {(record.transformed as SanityPageContent).subheading?.substring(0, 100)}...</span>
                    )}
                  </div>
                </div>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setOpenDetails((prev) => ({ ...prev, [index]: !isDetailsOpen }))}
                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  {isDetailsOpen ? 'Hide' : 'Show'} Details
                </button>
                <button
                  onClick={() => setOpenData((prev) => ({ ...prev, [index]: !isDataOpen }))}
                  className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition"
                >
                  {isDataOpen ? 'Hide' : 'Show'} Data
                </button>
              </div>
              {isDetailsOpen && (
                <div className="space-y-6">
                  {/* Content Analysis */}
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-3">Content Analysis</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Word Count:</span>
                        <span className="ml-2 font-semibold">
                          {(() => {
                            const content = record.transformed._type === 'post' ? (record.transformed as SanityPostContent).content : undefined;
                            const text = getTextFromBlockContent(content);
                            return text.split(/\s+/).filter(word => word.length > 0).length;
                          })()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Block Count:</span>
                        <span className="ml-2 font-semibold">
                          {record.transformed._type === 'post' ? ((record.transformed as SanityPostContent).content?.length || 0) : 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Content Type:</span>
                        <span className="ml-2 font-semibold">{record.transformed._type}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Images:</span>
                        <span className="ml-2 font-semibold">{record.transformed.media.filter(m => m.type === 'image').length}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Audio:</span>
                        <span className="ml-2 font-semibold">{record.transformed.media.filter(m => m.type === 'audio').length}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Video:</span>
                        <span className="ml-2 font-semibold">{record.transformed.media.filter(m => m.type === 'video').length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Media Gallery */}
                  {record.transformed.media.length > 0 && (
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-3">Media References</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {record.transformed.media.map((media, mediaIndex) => (
                          <div key={mediaIndex} className={`rounded p-3 ${media.found ? 'bg-green-600/20 border border-green-600' : 'bg-red-600/20 border border-red-600'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                media.type === 'image' ? 'bg-purple-600' : 
                                media.type === 'audio' ? 'bg-orange-600' : 'bg-pink-600'
                              }`}>
                                {media.type.toUpperCase()}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs ${media.found ? 'bg-green-600' : 'bg-red-600'}`}>
                                {media.found ? 'FOUND' : 'MISSING'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-300 space-y-1">
                              <div className="truncate">
                                <strong>URL:</strong> {media.url}
                              </div>
                              {media.found && media.localPath && (
                                <div className="truncate">
                                  <strong>Local:</strong> {media.localPath}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Content Comparison */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Original Content</h3>
                      <div className="bg-gray-950 text-gray-100 p-3 rounded max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap break-words text-sm">
                          {typeof record.original === 'object' && record.original !== null && 'post_content' in record.original && typeof (record.original as { post_content: string }).post_content === 'string'
                            ? (record.original as { post_content: string }).post_content
                            : ''}
                        </pre>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Transformed BlockContent</h3>
                      <div className="bg-gray-950 text-gray-100 p-3 rounded max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap break-words text-sm">
                          {JSON.stringify(record.transformed._type === 'post' ? (record.transformed as SanityPostContent).content : [], null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Rendered Preview</h3>
                      <div className="bg-white text-gray-900 p-3 rounded shadow max-h-96 overflow-y-auto">
                        <style dangerouslySetInnerHTML={{ __html: `
                          .preview-content img {
                            max-width: 100%;
                            height: auto;
                            display: block;
                            margin: 1rem auto;
                          }
                          .preview-content audio,
                          .preview-content video {
                            max-width: 100%;
                            margin: 1rem 0;
                          }
                        `}} />
                        <div
                          className="prose prose-sm max-w-none preview-content"
                          dangerouslySetInnerHTML={{ 
                            __html: processContentForPreview(
                              blockContentToHtml(record.transformed._type === 'post' ? (record.transformed as SanityPostContent).content : undefined), 
                              record.transformed.media
                            ) 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {isDataOpen && (
                <div className="flex flex-col md:flex-row gap-6 mt-4">
                  <div className="w-full md:w-1/2">
                    <h4 className="text-md font-semibold mb-2">Original JSON</h4>
                    <pre className="whitespace-pre-wrap break-words bg-gray-950 text-gray-100 p-3 rounded">
                      {JSON.stringify(record.original, null, 2)}
                    </pre>
                  </div>
                  <div className="w-full md:w-1/2">
                    <h4 className="text-md font-semibold mb-2">Transformed JSON</h4>
                    <pre className="whitespace-pre-wrap break-words bg-gray-950 text-gray-100 p-3 rounded">
                      {JSON.stringify(record.transformed, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
