/**
 * DocumentUpload Component - Document Upload with Drag & Drop
 *
 * A component for uploading documents for asset tokenization.
 *
 * @example
 * ```tsx
 * import { DocumentUpload } from '@tokenisation/sdk-react/components';
 *
 * function AssetDocuments({ assetId }: { assetId: string }) {
 *   return (
 *     <DocumentUpload
 *       assetId={assetId}
 *       acceptedTypes={['proof_of_ownership', 'valuation_report']}
 *       onUpload={(doc) => console.log('Uploaded:', doc)}
 *       multiple
 *     />
 *   );
 * }
 * ```
 */

import React, { useState, useCallback, useRef, type DragEvent } from 'react';
import { useAsset } from '../hooks/useAsset.js';
import type { DocumentType, UploadedDocument } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentUploadProps {
  /** Asset ID to associate documents with */
  assetId?: string;
  /** Party ID to associate documents with */
  partyId?: string;
  /** Document type to set */
  documentType?: DocumentType;
  /** Accepted document types (for display) */
  acceptedTypes?: DocumentType[];
  /** Allow multiple files */
  multiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Accepted MIME types */
  acceptedMimeTypes?: string[];
  /** Callback when upload completes */
  onUpload?: (document: UploadedDocument) => void;
  /** Callback on error */
  onError?: (error: Error, file: File) => void;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Disabled state */
  disabled?: boolean;
  /** Custom labels */
  labels?: {
    dropzone?: string;
    button?: string;
    uploading?: string;
    maxSize?: string;
  };
  /** Custom render for uploaded files list */
  renderUploadedFiles?: (files: UploadedDocument[]) => React.ReactNode;
}

// ============================================================================
// DEFAULT STYLES
// ============================================================================

const defaultStyles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
  },
  dropzone: {
    padding: '40px 20px',
    border: '2px dashed #d1d5db',
    borderRadius: '12px',
    backgroundColor: '#f9fafb',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dropzoneActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  dropzoneDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
    color: '#9ca3af',
  },
  text: {
    fontSize: '16px',
    color: '#374151',
    marginBottom: '8px',
  },
  subtext: {
    fontSize: '14px',
    color: '#6b7280',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#3b82f6',
    color: 'white',
    marginTop: '16px',
  },
  fileList: {
    marginTop: '20px',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    marginBottom: '8px',
  },
  fileName: {
    fontSize: '14px',
    color: '#374151',
    fontWeight: 500,
  },
  fileSize: {
    fontSize: '12px',
    color: '#6b7280',
  },
  progressBar: {
    width: '100%',
    height: '4px',
    backgroundColor: '#e5e7eb',
    borderRadius: '2px',
    marginTop: '8px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s',
  },
  successIcon: {
    color: '#10b981',
    fontSize: '20px',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '12px',
    marginTop: '4px',
  },
};

// ============================================================================
// DOCUMENT TYPE LABELS
// ============================================================================

const documentTypeLabels: Record<DocumentType, string> = {
  proof_of_ownership: 'Proof of Ownership',
  title_deed: 'Title Deed',
  valuation_report: 'Valuation Report',
  legal_opinion: 'Legal Opinion',
  prospectus: 'Prospectus',
  shareholder_agreement: 'Shareholder Agreement',
  id_document: 'ID Document',
  proof_of_address: 'Proof of Address',
  accreditation_letter: 'Accreditation Letter',
  tax_certificate: 'Tax Certificate',
  other: 'Other Document',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DocumentUpload({
  assetId,
  partyId,
  documentType = 'other',
  acceptedTypes,
  multiple = false,
  maxSize = 10 * 1024 * 1024, // 10MB default
  acceptedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'],
  onUpload,
  onError,
  className,
  style,
  disabled,
  labels = {},
  renderUploadedFiles,
}: DocumentUploadProps) {
  const { uploadDocument } = useAsset();

  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedDocument[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const inputRef = useRef<HTMLInputElement>(null);

  // Default labels
  const {
    dropzone = 'Drag & drop files here, or click to select',
    button = 'Select Files',
    uploading = 'Uploading...',
    maxSize: maxSizeLabel = `Maximum file size: ${formatFileSize(maxSize)}`,
  } = labels;

  // Handle drag events
  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragActive(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Process files
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);

      for (const file of fileArray) {
        // Validate file size
        if (file.size > maxSize) {
          const error = new Error(`File too large: ${file.name}`);
          setErrors((prev) => new Map(prev).set(file.name, error.message));
          onError?.(error, file);
          continue;
        }

        // Validate MIME type
        if (!acceptedMimeTypes.includes(file.type)) {
          const error = new Error(`Invalid file type: ${file.name}`);
          setErrors((prev) => new Map(prev).set(file.name, error.message));
          onError?.(error, file);
          continue;
        }

        // Start upload
        setUploadingFiles((prev) => new Map(prev).set(file.name, 0));

        try {
          // Simulate progress (real implementation would use XMLHttpRequest or fetch with progress)
          const progressInterval = setInterval(() => {
            setUploadingFiles((prev) => {
              const current = prev.get(file.name) || 0;
              if (current < 90) {
                return new Map(prev).set(file.name, current + 10);
              }
              return prev;
            });
          }, 200);

          const uploadedDoc = await uploadDocument(assetId || 'pending', file, {
            type: documentType,
            assetId,
            partyId,
          });

          clearInterval(progressInterval);
          setUploadingFiles((prev) => {
            const newMap = new Map(prev);
            newMap.delete(file.name);
            return newMap;
          });

          setUploadedFiles((prev) => [...prev, uploadedDoc]);
          onUpload?.(uploadedDoc);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          setUploadingFiles((prev) => {
            const newMap = new Map(prev);
            newMap.delete(file.name);
            return newMap;
          });
          setErrors((prev) => new Map(prev).set(file.name, error.message));
          onError?.(error, file);
        }
      }
    },
    [assetId, partyId, documentType, maxSize, acceptedMimeTypes, uploadDocument, onUpload, onError]
  );

  // Handle drop
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      if (disabled) return;

      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        if (!multiple && files.length > 1) {
          processFiles([files[0]]);
        } else {
          processFiles(files);
        }
      }
    },
    [disabled, multiple, processFiles]
  );

  // Handle click
  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  // Handle file input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        processFiles(files);
      }
      // Reset input
      e.target.value = '';
    },
    [processFiles]
  );

  return (
    <div className={className} style={{ ...defaultStyles.container, ...style }}>
      {/* Dropzone */}
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          ...defaultStyles.dropzone,
          ...(isDragActive ? defaultStyles.dropzoneActive : {}),
          ...(disabled ? defaultStyles.dropzoneDisabled : {}),
        }}
      >
        <div style={defaultStyles.icon}>&#128196;</div>
        <p style={defaultStyles.text}>{dropzone}</p>
        <p style={defaultStyles.subtext}>{maxSizeLabel}</p>
        {acceptedTypes && acceptedTypes.length > 0 && (
          <p style={defaultStyles.subtext}>
            Accepted: {acceptedTypes.map((t) => documentTypeLabels[t]).join(', ')}
          </p>
        )}
        <button
          type="button"
          style={defaultStyles.button}
          disabled={disabled}
        >
          {button}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={acceptedMimeTypes.join(',')}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {/* Uploading files */}
      {uploadingFiles.size > 0 && (
        <div style={defaultStyles.fileList}>
          {Array.from(uploadingFiles.entries()).map(([fileName, progress]) => (
            <div key={fileName} style={defaultStyles.fileItem}>
              <div>
                <div style={defaultStyles.fileName}>{fileName}</div>
                <div style={defaultStyles.progressBar}>
                  <div
                    style={{
                      ...defaultStyles.progressFill,
                      width: `${progress}%`,
                    }}
                  />
                </div>
              </div>
              <span style={defaultStyles.fileSize}>{uploading}</span>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div style={defaultStyles.fileList}>
          {renderUploadedFiles ? (
            renderUploadedFiles(uploadedFiles)
          ) : (
            uploadedFiles.map((doc) => (
              <div key={doc.id} style={defaultStyles.fileItem}>
                <div>
                  <div style={defaultStyles.fileName}>{doc.filename}</div>
                  <div style={defaultStyles.fileSize}>
                    {formatFileSize(doc.size)} • {documentTypeLabels[doc.type]}
                  </div>
                </div>
                <span style={defaultStyles.successIcon}>&#10004;</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Errors */}
      {errors.size > 0 && (
        <div style={{ marginTop: '12px' }}>
          {Array.from(errors.entries()).map(([fileName, error]) => (
            <p key={fileName} style={defaultStyles.errorText}>
              {fileName}: {error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
