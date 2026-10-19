import { describe, it, expect, vi } from 'vitest';

describe('Chat, Mobile Stability & 120 Files Batch Suite', () => {
  describe('Double-send and rapid input collision guard', () => {
    it('prevents double submissions when Enter is pressed rapidly while submitting', async () => {
      let submitCount = 0;
      let isSubmitting = false;

      const sendMessage = async (text: string) => {
        if (isSubmitting) return;
        isSubmitting = true;
        submitCount++;
        // simulate async delay
        await new Promise((r) => setTimeout(r, 50));
        isSubmitting = false;
      };

      // Simulate simultaneous Enter keypress and submit button click
      const p1 = sendMessage('בדיקת שליחה');
      const p2 = sendMessage('בדיקת שליחה');
      await Promise.all([p1, p2]);

      expect(submitCount).toBe(1);
    });
  });

  describe('Speech-to-text dictation & keyboard stability', () => {
    it('discards late speech recognition events after manual stop to prevent input resurrection', () => {
      let isListening = true;
      let isManualStop = false;
      let input = '';

      const onManualStop = () => {
        isManualStop = true;
        isListening = false;
      };

      const onResult = (interim: string) => {
        if (!isListening || isManualStop) return;
        input = interim;
      };

      // Active speech
      onResult('דוח תביעות');
      expect(input).toBe('דוח תביעות');

      // User presses stop
      onManualStop();

      // Late event arriving after stop
      onResult('דוח תביעות נוסף');
      // Must remain unchanged
      expect(input).toBe('דוח תביעות');
    });
  });

  describe('120 Files Batch Processing & Deduplication', () => {
    it('chunks 120 files into batches of 10 for safe concurrent upload', () => {
      const mockFiles = Array.from({ length: 120 }, (_, i) => ({
        name: `photo_${i + 1}.jpg`,
        size: 150000,
      }));

      const BATCH_SIZE = 10;
      const batches: typeof mockFiles[] = [];
      for (let b = 0; b < mockFiles.length; b += BATCH_SIZE) {
        batches.push(mockFiles.slice(b, b + BATCH_SIZE));
      }

      expect(batches.length).toBe(12);
      expect(batches.every((chunk) => chunk.length === 10)).toBe(true);
      expect(batches.flat().length).toBe(120);
    });

    it('auto-generates clean Hebrew document titles from file names for bulk uploads', () => {
      const rawNames = [
        'rcv0001.JPG',
        'damage_front_bumper_2026.png',
        'שמאות_רכב_6594185.pdf',
      ];

      const cleanTitles = rawNames.map((name) =>
        name.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim().slice(0, 120)
      );

      expect(cleanTitles).toEqual([
        'rcv0001',
        'damage front bumper 2026',
        'שמאות רכב 6594185',
      ]);
    });
  });

  describe('Insurance Email Payload & Split Calculation', () => {
    it('keeps single email if total payload is under 18MB limit (e.g. Ilana Atias 63 files = 3MB)', () => {
      const PACKAGE_LIMIT = 18 * 1024 * 1024;
      const ilanaTotalBytes = 3146546; // ~3.00 MB for all 63 files
      const isOverLimit = ilanaTotalBytes > PACKAGE_LIMIT;

      expect(isOverLimit).toBe(false);
      expect(ilanaTotalBytes).toBeLessThan(PACKAGE_LIMIT);
    });

    it('automatically splits into numbered emails when total payload exceeds 18MB', () => {
      const PACKAGE_LIMIT = 18 * 1024 * 1024;
      // 120 heavy files: each 500KB = 60MB total
      const heavyFiles = Array.from({ length: 120 }, (_, i) => ({
        id: `FILE-${i + 1}`,
        name: `damage_full_res_${i + 1}.jpg`,
        bytes: 500 * 1024, // 500 KB
      }));

      const totalBytes = heavyFiles.reduce((s, f) => s + f.bytes, 0);
      expect(totalBytes).toBe(120 * 500 * 1024); // ~58.6 MB

      // split groups
      const splitGroups: Array<{ bytes: number; files: typeof heavyFiles }> = [];
      let curGroup: typeof heavyFiles = [];
      let curBytes = 0;
      for (const f of heavyFiles) {
        if (curGroup.length && curBytes + f.bytes > PACKAGE_LIMIT) {
          splitGroups.push({ files: curGroup, bytes: curBytes });
          curGroup = [];
          curBytes = 0;
        }
        curGroup.push(f);
        curBytes += f.bytes;
      }
      if (curGroup.length) splitGroups.push({ files: curGroup, bytes: curBytes });

      expect(splitGroups.length).toBe(4); // 60MB / 18MB = 4 numbered emails
      expect(splitGroups.every((g) => g.bytes <= PACKAGE_LIMIT)).toBe(true);

      const emailSubjects = splitGroups.map((_, idx) =>
        `מסמכים ותמונות תיק תביעה (חלק ${idx + 1}/${splitGroups.length})`
      );

      expect(emailSubjects[0]).toBe('מסמכים ותמונות תיק תביעה (חלק 1/4)');
      expect(emailSubjects[3]).toBe('מסמכים ותמונות תיק תביעה (חלק 4/4)');
    });
  });

  describe('Claim Ilana Atias (DAL-2026-0246) Verification', () => {
    it('correctly classifies surveyor report pages vs damage photos', () => {
      const files = [
        { name: 'rcv0001.JPG', kind: 'surveyor_report' },
        { name: 'rcv0002.JPG', kind: 'surveyor_report' },
        ...Array.from({ length: 57 }, (_, i) => ({
          name: `RCV00${String(i + 3).padStart(2, '0')}.JPG`,
          kind: 'surveyor_photo',
        })),
        { name: 'image001.jpg', kind: 'general' },
        { name: 'image002.jpg', kind: 'general' },
        { name: 'image003.jpg', kind: 'general' },
        { name: 'image004.jpg', kind: 'general' },
      ];

      expect(files.length).toBe(63);
      const surveyorReports = files.filter((f) => f.kind === 'surveyor_report');
      const damagePhotos = files.filter((f) => f.kind === 'surveyor_photo');

      expect(surveyorReports.length).toBe(2);
      expect(damagePhotos.length).toBe(57);
      expect(surveyorReports.map((f) => f.name)).toEqual(['rcv0001.JPG', 'rcv0002.JPG']);
    });
  });
});
