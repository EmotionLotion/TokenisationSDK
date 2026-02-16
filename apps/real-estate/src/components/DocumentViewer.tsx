import { useState, useCallback } from 'react';
import { FileText, Shield, Lock, Download, Check } from 'lucide-react';
import { useAsset } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../hooks/useSDKWithFallback';

interface DocumentViewerProps {
  propertyId: string;
  propertyName: string;
}

interface Document {
  id: string;
  name: string;
  category: 'title-deeds' | 'legal' | 'valuation' | 'certificates';
  storageProvider: 'IPFS' | 'S3';
  sha256Hash: string;
  status: 'verified' | 'uploaded' | 'expired';
  uploadDate: string;
  fileSize: string;
}

const CATEGORY_LABELS: Record<Document['category'], string> = {
  'title-deeds': 'Title Deeds',
  'legal': 'Legal',
  'valuation': 'Valuation',
  'certificates': 'Certificates',
};

const MOCK_DOCUMENTS: Document[] = [
  {
    id: 'doc-001',
    name: 'Certificate of Title',
    category: 'title-deeds',
    storageProvider: 'IPFS',
    sha256Hash: 'a1b2c3d4e5f6789012345678abcdef9012345678abcdef9012345678abcdef90',
    status: 'verified',
    uploadDate: '2024-01-10',
    fileSize: '2.4 MB',
  },
  {
    id: 'doc-002',
    name: 'Title Deed Registration (DLD)',
    category: 'title-deeds',
    storageProvider: 'IPFS',
    sha256Hash: 'b2c3d4e5f6a1789012345678abcdef9012345678abcdef9012345678abcdef01',
    status: 'verified',
    uploadDate: '2024-01-10',
    fileSize: '1.8 MB',
  },
  {
    id: 'doc-003',
    name: 'SPV Memorandum of Association',
    category: 'legal',
    storageProvider: 'S3',
    sha256Hash: 'c3d4e5f6a1b2789012345678abcdef9012345678abcdef9012345678abcdef02',
    status: 'verified',
    uploadDate: '2024-01-12',
    fileSize: '3.1 MB',
  },
  {
    id: 'doc-004',
    name: 'Subscription Agreement Template',
    category: 'legal',
    storageProvider: 'S3',
    sha256Hash: 'd4e5f6a1b2c3789012345678abcdef9012345678abcdef9012345678abcdef03',
    status: 'verified',
    uploadDate: '2024-01-15',
    fileSize: '890 KB',
  },
  {
    id: 'doc-005',
    name: 'Token Terms & Conditions',
    category: 'legal',
    storageProvider: 'IPFS',
    sha256Hash: 'e5f6a1b2c3d4789012345678abcdef9012345678abcdef9012345678abcdef04',
    status: 'uploaded',
    uploadDate: '2024-02-01',
    fileSize: '1.2 MB',
  },
  {
    id: 'doc-006',
    name: 'RICS Valuation Report',
    category: 'valuation',
    storageProvider: 'S3',
    sha256Hash: 'f6a1b2c3d4e5789012345678abcdef9012345678abcdef9012345678abcdef05',
    status: 'verified',
    uploadDate: '2024-01-20',
    fileSize: '5.6 MB',
  },
  {
    id: 'doc-007',
    name: 'Market Comparable Analysis',
    category: 'valuation',
    storageProvider: 'S3',
    sha256Hash: 'a7b8c9d0e1f2789012345678abcdef9012345678abcdef9012345678abcdef06',
    status: 'uploaded',
    uploadDate: '2024-01-22',
    fileSize: '2.1 MB',
  },
  {
    id: 'doc-008',
    name: 'Smart Contract Audit (CertiK)',
    category: 'certificates',
    storageProvider: 'IPFS',
    sha256Hash: 'b8c9d0e1f2a3789012345678abcdef9012345678abcdef9012345678abcdef07',
    status: 'verified',
    uploadDate: '2024-01-25',
    fileSize: '4.3 MB',
  },
  {
    id: 'doc-009',
    name: 'RERA Permit Certificate',
    category: 'certificates',
    storageProvider: 'S3',
    sha256Hash: 'c9d0e1f2a3b4789012345678abcdef9012345678abcdef9012345678abcdef08',
    status: 'verified',
    uploadDate: '2024-01-08',
    fileSize: '650 KB',
  },
  {
    id: 'doc-010',
    name: 'Insurance Certificate (2023)',
    category: 'certificates',
    storageProvider: 'S3',
    sha256Hash: 'd0e1f2a3b4c5789012345678abcdef9012345678abcdef9012345678abcdef09',
    status: 'expired',
    uploadDate: '2023-03-15',
    fileSize: '1.1 MB',
  },
];

/** Infer a local category from the SDK document type or filename */
function inferDocumentCategory(type?: string, filename?: string): Document['category'] {
  const lower = (type ?? filename ?? '').toLowerCase();
  if (lower.includes('title') || lower.includes('deed')) return 'title-deeds';
  if (lower.includes('legal') || lower.includes('agreement') || lower.includes('memorandum') || lower.includes('terms') || lower.includes('subscription')) return 'legal';
  if (lower.includes('valuation') || lower.includes('comparable') || lower.includes('appraisal')) return 'valuation';
  return 'certificates';
}

/** Format a byte size to a human-readable string */
function formatFileSize(bytes?: number): string {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusBadge(status: Document['status']) {
  switch (status) {
    case 'verified':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs">
          <Check className="w-3 h-3" />
          Verified
        </span>
      );
    case 'uploaded':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs">
          Uploaded
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs">
          Expired
        </span>
      );
  }
}

export function DocumentViewer({ propertyId, propertyName }: DocumentViewerProps) {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());

  const asset = useAsset();

  const sdkCall = useCallback(async () => {
    const docs = await asset.getDocuments(propertyId);
    if (!docs || docs.length === 0) return null;
    return docs.map((doc): Document => ({
      id: doc.id,
      name: doc.filename ?? doc.type ?? 'Unknown Document',
      category: inferDocumentCategory(doc.type, doc.filename),
      storageProvider: doc.storageUri?.startsWith('ipfs://') ? 'IPFS' : 'S3',
      sha256Hash: doc.contentHash ?? '',
      status: doc.verified ? 'verified' : 'uploaded',
      uploadDate: typeof doc.uploadedAt === 'string'
        ? doc.uploadedAt.split('T')[0]
        : new Date(doc.uploadedAt).toISOString().split('T')[0],
      fileSize: formatFileSize(doc.size),
    }));
  }, [asset, propertyId]);

  const { data: documents } = useSDKWithFallback<Document[]>(
    sdkCall,
    MOCK_DOCUMENTS,
    [sdkCall],
  );

  const categories = Object.keys(CATEGORY_LABELS) as Document['category'][];

  const handleVerify = (docId: string) => {
    setVerifyingId(docId);
    setTimeout(() => {
      setVerifiedIds((prev) => new Set([...prev, docId]));
      setVerifyingId(null);
    }, 1500);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-[#F8B032]" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Document Vault</h3>
            <p className="text-gray-400 text-xs">{propertyName} &middot; {documents.length} documents</p>
          </div>
        </div>
      </div>

      {/* Document Categories */}
      <div className="p-6 space-y-6">
        {categories.map((category) => {
          const docs = documents.filter((d) => d.category === category);
          if (docs.length === 0) return null;

          return (
            <div key={category}>
              <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">
                {CATEGORY_LABELS[category]}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#F8B032] flex-shrink-0" />
                        <p className="text-white text-sm font-medium truncate">{doc.name}</p>
                      </div>
                      {getStatusBadge(doc.status)}
                    </div>

                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">Storage</span>
                        <span className="text-gray-300 text-xs font-mono">
                          {doc.storageProvider === 'IPFS' ? (
                            <span className="inline-flex items-center gap-1">
                              <Shield className="w-3 h-3 text-purple-400" />
                              IPFS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-3 h-3 text-blue-400" />
                              AWS S3
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">SHA-256</span>
                        <span className="text-gray-400 text-xs font-mono">
                          {doc.sha256Hash.slice(0, 8)}...{doc.sha256Hash.slice(-8)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">Uploaded</span>
                        <span className="text-gray-400 text-xs">{doc.uploadDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">Size</span>
                        <span className="text-gray-400 text-xs">{doc.fileSize}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleVerify(doc.id)}
                        disabled={verifyingId === doc.id || verifiedIds.has(doc.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          verifiedIds.has(doc.id)
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : verifyingId === doc.id
                              ? 'bg-white/5 text-gray-400 border border-white/10 cursor-wait'
                              : 'bg-[#F8B032]/10 text-[#F8B032] border border-[#F8B032]/20 hover:bg-[#F8B032]/20'
                        }`}
                      >
                        {verifiedIds.has(doc.id) ? (
                          <>
                            <Check className="w-3 h-3" />
                            Hash Verified
                          </>
                        ) : verifyingId === doc.id ? (
                          'Verifying...'
                        ) : (
                          <>
                            <Shield className="w-3 h-3" />
                            Verify Hash
                          </>
                        )}
                      </button>
                      <button className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-medium hover:bg-white/10 hover:text-white transition-colors">
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
