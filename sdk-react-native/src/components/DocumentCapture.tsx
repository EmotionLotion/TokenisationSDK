/**
 * DocumentCapture Component
 *
 * Camera-based document scanning component for KYC verification.
 * Provides guided capture for ID documents with auto-detection and cropping.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  SafeAreaView,
  Platform,
  Alert,
  type ViewStyle,
} from 'react-native';
import type { DocumentType, DocumentCapture as DocumentCaptureType } from '../hooks/useKYC.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Capture step in the flow
 */
type CaptureStep = 'instructions' | 'camera' | 'preview' | 'complete';

/**
 * Capture side for documents with front/back
 */
type CaptureSide = 'front' | 'back';

/**
 * Props for DocumentCapture component
 */
export interface DocumentCaptureProps {
  /** Type of document to capture */
  documentType: DocumentType;
  /** Called when capture is complete */
  onCapture: (document: DocumentCaptureType) => void;
  /** Called when capture is cancelled */
  onCancel?: () => void;
  /** Show as modal */
  asModal?: boolean;
  /** Modal visible state (required if asModal=true) */
  visible?: boolean;
  /** Whether document has a back side */
  hasBackSide?: boolean;
  /** Custom instructions text */
  instructionsText?: string;
  /** Custom colors */
  colors?: {
    primary?: string;
    background?: string;
    text?: string;
    textSecondary?: string;
    overlay?: string;
  };
  /** Custom container style */
  style?: ViewStyle;
}

// ============================================================================
// DEFAULT COLORS
// ============================================================================

const DEFAULT_COLORS = {
  primary: '#3b82f6',
  background: '#000000',
  text: '#ffffff',
  textSecondary: '#9ca3af',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

// ============================================================================
// DOCUMENT TYPE LABELS
// ============================================================================

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  passport: 'Passport',
  drivers_license: "Driver's License",
  national_id: 'National ID',
  residence_permit: 'Residence Permit',
};

const DOCUMENTS_WITH_BACK: DocumentType[] = [
  'drivers_license',
  'national_id',
  'residence_permit',
];

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * DocumentCapture - Document scanning component for KYC
 *
 * @example
 * ```tsx
 * function KycDocumentScreen() {
 *   const [showCapture, setShowCapture] = useState(false);
 *   const { submitDocuments } = useKYC();
 *
 *   const handleCapture = async (document: DocumentCapture) => {
 *     setShowCapture(false);
 *     await submitDocuments([document]);
 *   };
 *
 *   return (
 *     <>
 *       <Button
 *         title="Scan Document"
 *         onPress={() => setShowCapture(true)}
 *       />
 *       <DocumentCapture
 *         asModal
 *         visible={showCapture}
 *         documentType="drivers_license"
 *         onCapture={handleCapture}
 *         onCancel={() => setShowCapture(false)}
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export function DocumentCapture({
  documentType,
  onCapture,
  onCancel,
  asModal = false,
  visible = true,
  hasBackSide,
  instructionsText,
  colors: customColors,
  style,
}: DocumentCaptureProps): JSX.Element | null {
  const colors = { ...DEFAULT_COLORS, ...customColors };

  // State
  const [step, setStep] = useState<CaptureStep>('instructions');
  const [side, setSide] = useState<CaptureSide>('front');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);

  // Determine if document needs back side
  const needsBackSide = hasBackSide ?? DOCUMENTS_WITH_BACK.includes(documentType);

  // Reset state when document type changes
  useEffect(() => {
    setStep('instructions');
    setSide('front');
    setFrontImage(null);
    setBackImage(null);
  }, [documentType]);

  // Handle capture (mock implementation)
  const handleCapture = useCallback(async () => {
    // In a real implementation, this would:
    // 1. Use react-native-camera or react-native-vision-camera
    // 2. Detect document edges
    // 3. Crop and enhance the image
    // 4. Return the processed image

    // Mock implementation - simulate capture
    const mockImageUri = `mock://document_${documentType}_${side}_${Date.now()}`;

    if (side === 'front') {
      setFrontImage(mockImageUri);
      if (needsBackSide) {
        setStep('preview');
      } else {
        setStep('preview');
      }
    } else {
      setBackImage(mockImageUri);
      setStep('preview');
    }
  }, [documentType, side, needsBackSide]);

  // Handle confirm preview
  const handleConfirm = useCallback(() => {
    if (side === 'front' && needsBackSide && !backImage) {
      // Move to back side capture
      setSide('back');
      setStep('camera');
      return;
    }

    // Complete capture
    const document: DocumentCaptureType = {
      type: documentType,
      frontImage: frontImage!,
      backImage: needsBackSide ? backImage || undefined : undefined,
      capturedAt: new Date().toISOString(),
    };

    setStep('complete');
    onCapture(document);
  }, [documentType, frontImage, backImage, side, needsBackSide, onCapture]);

  // Handle retake
  const handleRetake = useCallback(() => {
    if (side === 'front') {
      setFrontImage(null);
    } else {
      setBackImage(null);
    }
    setStep('camera');
  }, [side]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setStep('instructions');
    setSide('front');
    setFrontImage(null);
    setBackImage(null);
    onCancel?.();
  }, [onCancel]);

  // Render instructions screen
  const renderInstructions = () => (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Scan Your {DOCUMENT_LABELS[documentType]}
        </Text>

        <Text style={[styles.instructions, { color: colors.textSecondary }]}>
          {instructionsText || getDefaultInstructions(documentType)}
        </Text>

        <View style={styles.tips}>
          <TipItem text="Make sure the document is well-lit" colors={colors} />
          <TipItem text="Avoid glare and shadows" colors={colors} />
          <TipItem text="Keep the document flat" colors={colors} />
          <TipItem text="Ensure all text is readable" colors={colors} />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => setStep('camera')}
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>
            Start Scanning
          </Text>
        </TouchableOpacity>

        {onCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // Render camera screen
  const renderCamera = () => (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.cameraHeader}>
        <Text style={[styles.cameraTitle, { color: colors.text }]}>
          {side === 'front' ? 'Scan Front Side' : 'Scan Back Side'}
        </Text>
        <Text style={[styles.cameraSubtitle, { color: colors.textSecondary }]}>
          Position your {DOCUMENT_LABELS[documentType]} within the frame
        </Text>
      </View>

      {/* Camera view placeholder */}
      <View style={styles.cameraContainer}>
        <View style={[styles.cameraPlaceholder, { borderColor: colors.primary }]}>
          <Text style={[styles.cameraPlaceholderText, { color: colors.textSecondary }]}>
            Camera View
          </Text>
          <Text style={[styles.cameraPlaceholderHint, { color: colors.textSecondary }]}>
            (In production, camera preview would appear here)
          </Text>
        </View>

        {/* Overlay frame */}
        <View style={[styles.frameOverlay, { borderColor: colors.primary }]} />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.captureButton, { backgroundColor: colors.primary }]}
          onPress={handleCapture}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render preview screen
  const renderPreview = () => {
    const currentImage = side === 'front' ? frontImage : backImage;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.previewHeader}>
          <Text style={[styles.title, { color: colors.text }]}>
            Review {side === 'front' ? 'Front' : 'Back'} Side
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Make sure all details are clearly visible
          </Text>
        </View>

        <View style={styles.previewContainer}>
          {/* Preview image placeholder */}
          <View style={[styles.previewImage, { borderColor: colors.primary }]}>
            <Text style={[styles.previewPlaceholder, { color: colors.textSecondary }]}>
              Captured Image
            </Text>
            <Text style={[styles.previewUri, { color: colors.textSecondary }]}>
              {currentImage?.slice(0, 30)}...
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={handleConfirm}
          >
            <Text style={[styles.buttonText, { color: colors.text }]}>
              {side === 'front' && needsBackSide && !backImage
                ? 'Continue to Back'
                : 'Confirm'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: colors.primary }]}
            onPress={handleRetake}
          >
            <Text style={[styles.outlineButtonText, { color: colors.primary }]}>
              Retake
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Main render
  const renderContent = () => {
    switch (step) {
      case 'instructions':
        return renderInstructions();
      case 'camera':
        return renderCamera();
      case 'preview':
        return renderPreview();
      case 'complete':
        return null; // Component will unmount after capture
      default:
        return renderInstructions();
    }
  };

  // Don't render if not visible
  if (!visible) return null;

  // Render as modal or inline
  if (asModal) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCancel}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          {renderContent()}
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <View style={[styles.inlineContainer, style]}>
      {renderContent()}
    </View>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface TipItemProps {
  text: string;
  colors: typeof DEFAULT_COLORS;
}

function TipItem({ text, colors }: TipItemProps): JSX.Element {
  return (
    <View style={styles.tipItem}>
      <View style={[styles.tipDot, { backgroundColor: colors.primary }]} />
      <Text style={[styles.tipText, { color: colors.textSecondary }]}>
        {text}
      </Text>
    </View>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDefaultInstructions(documentType: DocumentType): string {
  switch (documentType) {
    case 'passport':
      return 'Position the photo page of your passport within the frame. Make sure all text and the photo are clearly visible.';
    case 'drivers_license':
      return "Position your driver's license within the frame. You'll need to scan both the front and back.";
    case 'national_id':
      return 'Position your national ID card within the frame. You may need to scan both sides.';
    case 'residence_permit':
      return 'Position your residence permit within the frame. Ensure all details are clearly visible.';
    default:
      return 'Position your document within the frame and ensure all text is clearly visible.';
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  inlineContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  instructions: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  tips: {
    marginVertical: 16,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  tipText: {
    fontSize: 14,
  },
  buttonContainer: {
    paddingTop: 24,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
  },
  cameraHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  cameraTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  cameraSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  cameraContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPlaceholder: {
    width: '100%',
    aspectRatio: 1.6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPlaceholderText: {
    fontSize: 18,
    marginBottom: 8,
  },
  cameraPlaceholderHint: {
    fontSize: 12,
  },
  frameOverlay: {
    position: 'absolute',
    width: '90%',
    aspectRatio: 1.6,
    borderWidth: 3,
    borderRadius: 8,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'white',
  },
  previewHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1.6,
    borderWidth: 2,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPlaceholder: {
    fontSize: 18,
    marginBottom: 8,
  },
  previewUri: {
    fontSize: 10,
  },
});

export default DocumentCapture;
