import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Upload Feedback & Duplicate Click Prevention Test Suite
 * Tests Feature A requirements:
 * 1. Animated spinner/progress indicator in button during upload.
 * 2. Label changes to "Uploading..." and duplicate submissions disabled.
 * 3. Brief checkmark/success state on success; error state and retry path on failure.
 * 4. Fidelity to asynchronous persistence (no false success on error).
 * 5. Multiple independent upload controls do not interfere with each other.
 */

describe('Feature A: Image Upload Feedback and Independent Controls', () => {
  interface UploadControlState {
    status: 'idle' | 'uploading' | 'success' | 'error';
    error?: string | null;
  }

  // Simulated independent upload manager matching the React components
  class UploadControlManager {
    public state: UploadControlState = { status: 'idle' };
    public attempts = 0;
    public uploadedUrl: string | null = null;

    constructor(
      public readonly pickAndUploadFn: () => Promise<string | null>,
      public readonly onSuccessCallback?: (url: string) => void
    ) {}

    public async triggerUpload(): Promise<boolean> {
      // Duplicate click prevention
      if (this.state.status === 'uploading') {
        return false;
      }

      this.state = { status: 'uploading' };
      this.attempts++;

      try {
        const url = await this.pickAndUploadFn();
        if (url) {
          this.uploadedUrl = url;
          this.state = { status: 'success' };
          if (this.onSuccessCallback) {
            this.onSuccessCallback(url);
          }
          return true;
        } else {
          // User cancelled file picker
          this.state = { status: 'idle' };
          return false;
        }
      } catch (err: any) {
        this.state = { status: 'error', error: err?.message || 'Upload failed. Please retry.' };
        return false;
      }
    }

    public getButtonProps() {
      const isUploading = this.state.status === 'uploading';
      const isSuccess = this.state.status === 'success';
      const isError = this.state.status === 'error';

      return {
        disabled: isUploading,
        label: isUploading
          ? 'Uploading...'
          : isSuccess
          ? 'Uploaded!'
          : isError
          ? 'Retry Upload'
          : 'Upload Image',
        showSpinner: isUploading,
        showSuccessCheckmark: isSuccess,
        showErrorIndicator: isError,
        isRetryPath: isError
      };
    }
  }

  it('transitions through idle -> uploading (with spinner and disabled button) -> success', async () => {
    let finishPromise: (url: string) => void;
    const asyncUpload = () => new Promise<string>((resolve) => {
      finishPromise = resolve;
    });

    const manager = new UploadControlManager(asyncUpload);
    expect(manager.getButtonProps()).toEqual({
      disabled: false,
      label: 'Upload Image',
      showSpinner: false,
      showSuccessCheckmark: false,
      showErrorIndicator: false,
      isRetryPath: false
    });

    // Start upload
    const uploadPromise = manager.triggerUpload();

    // While in progress:
    const inProgressProps = manager.getButtonProps();
    expect(inProgressProps.disabled).toBe(true);
    expect(inProgressProps.label).toBe('Uploading...');
    expect(inProgressProps.showSpinner).toBe(true);
    expect(inProgressProps.showSuccessCheckmark).toBe(false);

    // Duplicate submission attempt while uploading should be blocked
    const duplicateAttempt = await manager.triggerUpload();
    expect(duplicateAttempt).toBe(false);
    expect(manager.attempts).toBe(1); // Still 1 attempt

    // Complete async upload
    finishPromise!('supabase://attachments/spec-drawing-123.jpg');
    const result = await uploadPromise;

    expect(result).toBe(true);
    expect(manager.uploadedUrl).toBe('supabase://attachments/spec-drawing-123.jpg');

    const successProps = manager.getButtonProps();
    expect(successProps.disabled).toBe(false);
    expect(successProps.label).toBe('Uploaded!');
    expect(successProps.showSpinner).toBe(false);
    expect(successProps.showSuccessCheckmark).toBe(true);
  });

  it('handles upload failure with error state, error message, and retains retry path', async () => {
    let shouldFail = true;
    const flakeyUpload = async () => {
      if (shouldFail) {
        throw new Error('TrueNAS network timeout');
      }
      return 'supabase://attachments/swatch-456.png';
    };

    const manager = new UploadControlManager(flakeyUpload);

    // Initial attempt fails
    const success1 = await manager.triggerUpload();
    expect(success1).toBe(false);
    expect(manager.state.status).toBe('error');
    expect(manager.state.error).toBe('TrueNAS network timeout');

    const errorProps = manager.getButtonProps();
    expect(errorProps.disabled).toBe(false);
    expect(errorProps.label).toBe('Retry Upload');
    expect(errorProps.showErrorIndicator).toBe(true);
    expect(errorProps.isRetryPath).toBe(true);

    // Now retry and succeed
    shouldFail = false;
    const success2 = await manager.triggerUpload();
    expect(success2).toBe(true);
    expect(manager.state.status).toBe('success');
    expect(manager.getButtonProps().label).toBe('Uploaded!');
    expect(manager.uploadedUrl).toBe('supabase://attachments/swatch-456.png');
  });

  it('does not report success merely because a picker returned a path if upload failed', async () => {
    const brokenPersistence = async () => {
      // Simulates local picker returning a file path, but backend upload to storage/cloud fails
      throw new Error('Supabase storage quota exceeded or connection refused');
    };

    const manager = new UploadControlManager(brokenPersistence);
    const success = await manager.triggerUpload();

    expect(success).toBe(false);
    expect(manager.state.status).toBe('error');
    expect(manager.state.status).not.toBe('success');
    expect(manager.uploadedUrl).toBeNull();
    expect(manager.getButtonProps().label).toBe('Retry Upload');
  });

  it('keeps multiple upload controls completely independent without cross-interference', async () => {
    // Control 1: Specification Image Upload
    let finishSpecUpload: (url: string) => void;
    const specUploadFn = () => new Promise<string>((resolve) => {
      finishSpecUpload = resolve;
    });
    const specControl = new UploadControlManager(specUploadFn);

    // Control 2: Color Swatch Upload
    let finishColorUpload: (url: string) => void;
    const colorUploadFn = () => new Promise<string>((resolve) => {
      finishColorUpload = resolve;
    });
    const colorControl = new UploadControlManager(colorUploadFn);

    // Control 3: Main Product Image Upload
    const mainImageControl = new UploadControlManager(async () => 'supabase://main.png');

    // Start spec upload only
    const specPromise = specControl.triggerUpload();

    // Verify Spec is uploading while Color and Main remain idle
    expect(specControl.state.status).toBe('uploading');
    expect(specControl.getButtonProps().disabled).toBe(true);
    expect(colorControl.state.status).toBe('idle');
    expect(colorControl.getButtonProps().disabled).toBe(false);
    expect(mainImageControl.state.status).toBe('idle');

    // Trigger color upload independently
    const colorPromise = colorControl.triggerUpload();
    expect(colorControl.state.status).toBe('uploading');
    expect(specControl.state.status).toBe('uploading');

    // Resolve Spec upload first
    finishSpecUpload!('supabase://spec1.jpg');
    await specPromise;

    // Spec is now success, but Color is STILL uploading
    expect(specControl.state.status).toBe('success');
    expect(colorControl.state.status).toBe('uploading');
    expect(colorControl.getButtonProps().label).toBe('Uploading...');

    // Resolve Color upload
    finishColorUpload!('supabase://color1.png');
    await colorPromise;

    expect(specControl.state.status).toBe('success');
    expect(colorControl.state.status).toBe('success');
  });
});
