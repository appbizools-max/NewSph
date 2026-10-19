import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, MapPin, Camera, Calendar, CheckCircle, XCircle, AlertCircle,
  FileText, PhoneCall, Star, Send, User, ChevronRight, Eye
} from 'lucide-react';
import {
  collection, query, onSnapshot, addDoc, updateDoc, doc, orderBy, getDocs
} from 'firebase/firestore';
import { db, StaffAttendanceRecord, StaffLeaveRequest, StaffDailyReport } from '@app/shared';
import {
  createStaffPunchInNotificationInFirestore,
  createStaffPunchOutNotificationInFirestore,
  createStaffDailyReportNotificationInFirestore,
  createStaffLeaveRequestNotificationInFirestore
} from '../../utils/fcmWebTrigger';

interface StaffDashboardPageProps {
  currentStaffId?: string;
  currentStaffName?: string;
  currentBranch?: string;
}

export const StaffDashboardPage: React.FC<StaffDashboardPageProps> = ({
  currentStaffId = '1',
  currentStaffName = 'Anil Kumar M',
  currentBranch = 'KPHB'
}) => {
  const [activeTab, setActiveTab] = useState<'punch' | 'leaves' | 'reports' | 'history'>('punch');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  // Staff Profile
  const [staffProfile, setStaffProfile] = useState({
    id: currentStaffId,
    name: currentStaffName,
    branch: currentBranch,
    role: 'Regular Staff',
    shift: '10:00 AM - 08:30 PM',
    salary: '₹22,000'
  });

  // Attendance states
  const [todayAttendance, setTodayAttendance] = useState<StaffAttendanceRecord | null>(null);
  const [allAttendance, setAllAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [isPunching, setIsPunching] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Leave Form states
  const [leaveType, setLeaveType] = useState<'Casual' | 'Sick' | 'Privilege' | 'Emergency' | 'Half Day'>('Casual');
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [leaveJoiningDate, setLeaveJoiningDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [myLeaves, setMyLeaves] = useState<StaffLeaveRequest[]>([]);

  // Daily Work Report Form states (Total Calls, Follow Ups, Contacts, G-Reviews, Video Reviews)
  const [totalCalls, setTotalCalls] = useState('');
  const [followUps, setFollowUps] = useState('');
  const [contacts, setContacts] = useState('');
  const [gReviews, setGReviews] = useState('');
  const [videoReviews, setVideoReviews] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [myReports, setMyReports] = useState<StaffDailyReport[]>([]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Check if today's report already submitted (once per day only)
  const todayReport = useMemo(() => {
    return myReports.find(r => r.date === todayStr);
  }, [myReports, todayStr]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!leaveFrom) setLeaveFrom(todayStr);
    if (!leaveTo) setLeaveTo(todayStr);
  }, [todayStr]);

  // Synchronize state immediately when props change
  useEffect(() => {
    setStaffProfile(prev => ({
      ...prev,
      id: currentStaffId || prev.id,
      name: currentStaffName || prev.name,
      branch: currentBranch || prev.branch
    }));
  }, [currentStaffId, currentStaffName, currentBranch]);

  // Load Staff Profile live from Firestore
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'staff'), (snap) => {
      snap.forEach(d => {
        const data = d.data();
        if (
          (currentStaffId && d.id === currentStaffId) ||
          (currentStaffName && data.name && data.name.toLowerCase().trim() === currentStaffName.toLowerCase().trim())
        ) {
          setStaffProfile({
            id: d.id,
            name: data.name || currentStaffName,
            branch: data.branch || currentBranch,
            role: data.role || 'Regular Staff',
            shift: data.shift || '10:00 AM - 08:30 PM',
            salary: data.salary || '₹22,000'
          });
        }
      });
    }, (e) => console.warn('Staff profile listener notice:', e));
    return () => unsub();
  }, [currentStaffId, currentStaffName, currentBranch]);

  // Subscribe to Attendance
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'attendance'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: StaffAttendanceRecord[] = [];
      snap.forEach(d => {
        const data = d.data() as any;
        if (data.staffId === staffProfile.id || data.staffName === staffProfile.name) {
          list.push({ id: d.id, ...data });
        }
      });
      setAllAttendance(list);
      setTodayAttendance(list.find(a => a.date === todayStr) || null);
    }, (err) => console.warn('Attendance error:', err));
    return () => unsub();
  }, [staffProfile.id, staffProfile.name, todayStr]);

  // Subscribe to Leaves
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'leaves'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: StaffLeaveRequest[] = [];
      snap.forEach(d => {
        const data = d.data() as any;
        if (data.staffId === staffProfile.id || data.staffName === staffProfile.name) {
          list.push({ id: d.id, ...data });
        }
      });
      setMyLeaves(list);
    }, (err) => console.warn('Leaves error:', err));
    return () => unsub();
  }, [staffProfile.id, staffProfile.name]);

  // Subscribe to Daily Reports
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'staff_reports'), orderBy('submittedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: StaffDailyReport[] = [];
      snap.forEach(d => {
        const data = d.data() as any;
        if (data.staffId === staffProfile.id || data.staffName === staffProfile.name) {
          list.push({ id: d.id, ...data });
        }
      });
      setMyReports(list);
    }, (err) => console.warn('Reports error:', err));
    return () => unsub();
  }, [staffProfile.id, staffProfile.name]);

  // High-Accuracy Web GPS Fetcher with Real Reverse Geocoding and Strict Location Enforcing
  const getWebLocation = (): Promise<{ latitude: number; longitude: number; address: string }> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const msg = 'Location Error: Geolocation is not supported by your browser. Please use a browser with GPS support.';
        alert(msg);
        reject(new Error(msg));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(5));
          const lon = Number(pos.coords.longitude.toFixed(5));
          let formattedAddress = '';

          try {
            // Reverse Geocode using OpenStreetMap Nominatim for exact street & area name
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`, {
              headers: { 'Accept-Language': 'en', 'User-Agent': 'SpiritualHomeoWeb/1.0' }
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.address) {
                const a = data.address;
                const parts = [
                  a.road || a.pedestrian || a.street,
                  a.neighbourhood || a.suburb || a.colony || a.residential,
                  a.city_district || a.subdistrict || a.county,
                  a.city || a.town || a.village || a.municipality,
                  a.state_district,
                  a.postcode ? `PIN: ${a.postcode}` : ''
                ].filter(Boolean);

                if (parts.length > 0) {
                  formattedAddress = parts.join(', ');
                }
              }
              if (!formattedAddress && data?.display_name) {
                formattedAddress = data.display_name.split(',').slice(0, 4).join(', ').trim();
              }
            }
          } catch (geoErr) {
            console.warn('Reverse geocoding notice:', geoErr);
          }

          if (!formattedAddress) {
            formattedAddress = `Location Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          }

          resolve({
            latitude: lat,
            longitude: lon,
            address: `${formattedAddress} [GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}]`
          });
        },
        (err) => {
          let errorMsg = 'Please turn on your device Location / GPS services to Punch In or Punch Out.';
          if (err.code === 1) {
            errorMsg = 'Location permission was denied. Please allow location access in your browser settings to Punch In / Punch Out.';
          } else if (err.code === 2) {
            errorMsg = 'Location unavailable. Please make sure your device GPS / Location service is turned ON.';
          } else if (err.code === 3) {
            errorMsg = 'Location request timed out. Please ensure GPS has a clear signal and retry.';
          }
          alert(`Location Required:\n\n${errorMsg}`);
          reject(new Error(errorMsg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  // Web Webcam / Camera Photo Capture using canvas compression
  const captureWebSelfie = (): Promise<string> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'user';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const rawUrl = evt.target?.result as string;
            // Compress with Canvas to max 400x400 with 0.5 JPEG quality
            const img = new window.Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxDim = 400;
              let width = img.width;
              let height = img.height;
              if (width > height) {
                if (width > maxDim) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                }
              } else {
                if (height > maxDim) {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                const compressed = canvas.toDataURL('image/jpeg', 0.5);
                resolve(compressed);
              } else {
                resolve(rawUrl);
              }
            };
            img.onerror = () => resolve(rawUrl);
            img.src = rawUrl;
          };
          reader.readAsDataURL(file);
        } else {
          resolve(`data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23eef5fc" stroke="%23258ec8" stroke-width="4"/><text x="50" y="55" font-size="24" font-weight="bold" fill="%23258ec8" text-anchor="middle">${encodeURIComponent(staffProfile.name.slice(0, 2))}</text></svg>`);
        }
      };
      input.click();
    });
  };

  // Punch In Handler
  const handlePunchIn = async () => {
    setIsPunching(true);
    try {
      const loc = await getWebLocation();
      const photo = await captureWebSelfie();
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      if (db) {
        const record: Omit<StaffAttendanceRecord, 'id'> = {
          staffId: staffProfile.id,
          staffName: staffProfile.name,
          role: staffProfile.role,
          branch: staffProfile.branch,
          date: todayStr,
          punchInTime: timeStr,
          punchInLocation: loc,
          punchInPhoto: photo,
          status: 'Present',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };

        await addDoc(collection(db, 'attendance'), record);

        // Notify HR in Firestore
        createStaffPunchInNotificationInFirestore({
          staffName: staffProfile.name,
          staffId: staffProfile.id,
          branch: staffProfile.branch,
          punchInTime: timeStr,
          locationAddress: loc.address
        }).catch(() => {});

        alert(`Punch In Successful!\n\nPunched in at: ${timeStr}\nLocation: ${loc.address}`);
      }
    } catch (e: any) {
      console.warn('Punch in halted:', e?.message || e);
    } finally {
      setIsPunching(false);
    }
  };

  // Punch Out Handler (Takes Selfie + Location)
  const handlePunchOut = async () => {
    if (!todayAttendance?.id) return;
    if (!window.confirm('Please capture your Punch-Out selfie photo to complete clocking out for today.')) return;

    setIsPunching(true);
    try {
      const photo = await captureWebSelfie();
      const loc = await getWebLocation();
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      let hours = '8.0 hrs';
      try {
        if (todayAttendance.punchInTime) {
          const [timePart, meridiem] = todayAttendance.punchInTime.split(' ');
          const [h, m] = timePart.split(':').map(Number);
          let inHour = h % 12 + (meridiem === 'PM' ? 12 : 0);
          const inDate = new Date();
          inDate.setHours(inHour, m, 0, 0);
          const diffMs = Math.max(0, now.getTime() - inDate.getTime());
          hours = `${(diffMs / (1000 * 60 * 60)).toFixed(1)} hrs`;
        }
      } catch (_) {}

      if (db) {
        await updateDoc(doc(db, 'attendance', todayAttendance.id), {
          punchOutTime: timeStr,
          punchOutLocation: loc,
          punchOutPhoto: photo,
          workingHours: hours,
          status: 'Completed',
          updatedAt: now.toISOString()
        });

        // Notify HR in Firestore
        createStaffPunchOutNotificationInFirestore({
          staffName: staffProfile.name,
          staffId: staffProfile.id,
          branch: staffProfile.branch,
          punchOutTime: timeStr,
          workingHours: hours,
          locationAddress: loc.address
        }).catch(() => {});

        alert(`Punch Out Successful!\n\nTotal Hours: ${hours}\nLocation: ${loc.address}`);
      }
    } catch (e: any) {
      console.warn('Punch out halted:', e?.message || e);
    } finally {
      setIsPunching(false);
    }
  };

  // Leave Submit
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveFrom || !leaveTo || !leaveReason.trim()) {
      alert('Please fill out all leave fields.');
      return;
    }
    setIsSubmittingLeave(true);
    try {
      const d1 = new Date(leaveFrom).getTime();
      const d2 = new Date(leaveTo).getTime();
      const days = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);

      // Auto-compute joining date if not provided (next day after leaveTo)
      let finalJoiningDate = leaveJoiningDate;
      if (!finalJoiningDate && !isNaN(d2)) {
        const nextDay = new Date(d2 + 24 * 60 * 60 * 1000);
        const y = nextDay.getFullYear();
        const m = String(nextDay.getMonth() + 1).padStart(2, '0');
        const d = String(nextDay.getDate()).padStart(2, '0');
        finalJoiningDate = `${d}-${m}-${y}`;
      } else if (finalJoiningDate.includes('-') && finalJoiningDate.split('-')[0].length === 4) {
        const p = finalJoiningDate.split('-');
        finalJoiningDate = `${p[2]}-${p[1]}-${p[0]}`;
      }

      const formattedFromDate = leaveFrom.includes('-') && leaveFrom.split('-')[0].length === 4
        ? `${leaveFrom.split('-')[2]}-${leaveFrom.split('-')[1]}-${leaveFrom.split('-')[0]}`
        : leaveFrom;
      const formattedToDate = leaveTo.includes('-') && leaveTo.split('-')[0].length === 4
        ? `${leaveTo.split('-')[2]}-${leaveTo.split('-')[1]}-${leaveTo.split('-')[0]}`
        : leaveTo;

      if (db) {
        const newLeave: any = {
          staffId: staffProfile.id,
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          leaveType,
          fromDate: formattedFromDate,
          toDate: formattedToDate,
          joiningDate: finalJoiningDate,
          daysCount: days,
          reason: leaveReason.trim(),
          status: 'Pending',
          createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'leaves'), newLeave);

        // Send push notification to Admin & HR
        createStaffLeaveRequestNotificationInFirestore({
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          staffId: staffProfile.id,
          leaveType,
          fromDate: formattedFromDate,
          toDate: formattedToDate,
          daysCount: days,
          reason: leaveReason.trim(),
        }).catch(() => {});

        alert(`Leave request for ${days} day(s) (${formattedFromDate} to ${formattedToDate}, Joining on ${finalJoiningDate}) submitted to Admin & HR!`);
        setLeaveReason('');
      }
    } catch (e) {
      console.error(e);
      alert('Error submitting leave.');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  // Work Report Submit (once in a day only)
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (todayReport) {
      alert('You have already submitted your daily work report for today. Daily report can only be submitted once per day.');
      return;
    }

    const tCalls = Number(totalCalls) || 0;
    const fUps = Number(followUps) || 0;
    const conts = Number(contacts) || 0;
    const gRev = Number(gReviews) || 0;
    const vRev = Number(videoReviews) || 0;

    if (!totalCalls && !followUps && !contacts && !gReviews && !videoReviews && !reportNotes.trim()) {
      alert('Please enter your daily metrics or work notes.');
      return;
    }
    setIsSubmittingReport(true);
    try {
      if (db) {
        const newRep: Omit<StaffDailyReport, 'id'> = {
          staffId: staffProfile.id,
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          date: todayStr,
          totalCalls: tCalls,
          followUps: fUps,
          contacts: conts,
          gReviews: gRev,
          videoReviews: vRev,
          callsCount: tCalls,
          reviewsCount: gRev,
          tasksSummary: reportNotes.trim(),
          notes: reportNotes.trim(),
          submittedAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'staff_reports'), newRep);

        // Notify HR in Firestore
        createStaffDailyReportNotificationInFirestore({
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          staffId: staffProfile.id,
          totalCalls: tCalls,
          followUps: fUps,
          contacts: conts,
          gReviews: gRev,
          videoReviews: vRev,
          notes: reportNotes.trim(),
        }).catch(() => {});

        alert('Daily work report submitted successfully to Admin & HR!');
        setTotalCalls('');
        setFollowUps('');
        setContacts('');
        setGReviews('');
        setVideoReviews('');
        setReportNotes('');
      }
    } catch (e) {
      console.error(e);
      alert('Error submitting daily report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div style={{ padding: '24px 20px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Top Banner Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '26px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={28} color="#0284c7" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{staffProfile.name}</h1>
              <span style={{ fontSize: '11px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px' }}>
                Staff ID #{staffProfile.id}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0 0' }}>
              {staffProfile.role} • <strong>{staffProfile.branch} Branch</strong> • Shift: {staffProfile.shift}
            </p>
          </div>
        </div>

        {/* Live Digital Clock */}
        <div style={{ background: '#0f172a', color: '#ffffff', borderRadius: '12px', padding: '10px 18px', textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '1px' }}>
            {currentDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            {currentDateTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '20px' }}>
        {[
          { id: 'punch', label: 'Punch In / Out', icon: <Clock size={16} /> },
          { id: 'leaves', label: `Apply Leave (${myLeaves.filter(l => l.status === 'Pending').length})`, icon: <Calendar size={16} /> },
          { id: 'reports', label: 'Daily Work Report', icon: <FileText size={16} /> },
          { id: 'history', label: 'Monthly Attendance Log', icon: <CheckCircle size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              background: activeTab === tab.id ? '#258ec8' : '#f1f5f9',
              color: activeTab === tab.id ? '#ffffff' : '#475569',
              transition: 'all 0.2s'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PUNCH IN / OUT */}
      {activeTab === 'punch' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Today's Punch Verification</h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
              Requires web camera/selfie photo and clinic GPS coordinates verification.
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Clock In:</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: todayAttendance?.punchInTime ? '#16a34a' : '#94a3b8' }}>
                    {todayAttendance?.punchInTime || '--:--'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Clock Out:</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: todayAttendance?.punchOutTime ? '#dc2626' : '#94a3b8' }}>
                    {todayAttendance?.punchOutTime || '--:--'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {todayAttendance?.punchInPhoto && (
                    <button
                      onClick={() => setPreviewPhotoUrl(todayAttendance.punchInPhoto || null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center' }}
                    >
                      <img src={todayAttendance.punchInPhoto} alt="In Selfie" style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #16a34a' }} />
                      <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>In Selfie</div>
                    </button>
                  )}
                  {(todayAttendance as any)?.punchOutPhoto && (
                    <button
                      onClick={() => setPreviewPhotoUrl((todayAttendance as any).punchOutPhoto || null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center' }}
                    >
                      <img src={(todayAttendance as any).punchOutPhoto} alt="Out Selfie" style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #dc2626' }} />
                      <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700 }}>Out Selfie</div>
                    </button>
                  )}
                </div>
              </div>

              {todayAttendance?.punchInLocation && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#0f766e', fontWeight: 600 }}>
                  <MapPin size={14} /> Location: {todayAttendance.punchInLocation.address}
                </div>
              )}
            </div>

            {/* Buttons */}
            {!todayAttendance ? (
              <button
                onClick={handlePunchIn}
                disabled={isPunching}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#16a34a',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Camera size={20} /> {isPunching ? 'Verifying...' : 'PUNCH IN (GPS + SELFIE)'}
              </button>
            ) : !todayAttendance.punchOutTime ? (
              <button
                onClick={handlePunchOut}
                disabled={isPunching}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Clock size={20} /> {isPunching ? 'Clocking Out...' : 'PUNCH OUT'}
              </button>
            ) : (
              <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '14px', borderRadius: '10px', textAlign: 'center', fontWeight: 800, fontSize: '14px' }}>
                ✓ Today's Shift Completed (Total: {todayAttendance.workingHours || 'Done'})
              </div>
            )}
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '12px' }}>
                <CheckCircle size={24} color="#16a34a" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{allAttendance.length} Days</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Total Days Present Recorded</div>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#fefce8', padding: '12px', borderRadius: '12px' }}>
                <Calendar size={24} color="#ca8a04" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#ca8a04' }}>
                  {myLeaves.filter(l => l.status === 'Approved').length} Approved
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Approved Leave Days</div>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '12px' }}>
                <FileText size={24} color="#2563eb" />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563eb' }}>{myReports.length} Reports</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Daily Work Logs Submitted</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: APPLY LEAVE */}
      {activeTab === 'leaves' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Apply for Leave</h3>
            <form onSubmit={handleApplyLeave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>Category:</label>
                <select
                  value={leaveType}
                  onChange={(e: any) => setLeaveType(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                >
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Privilege">Privilege Leave</option>
                  <option value="Emergency">Emergency Leave</option>
                  <option value="Half Day">Half Day</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>From Date:</label>
                  <input
                    type="date"
                    value={leaveFrom}
                    onChange={(e) => setLeaveFrom(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>To Date:</label>
                  <input
                    type="date"
                    value={leaveTo}
                    onChange={(e) => {
                      setLeaveTo(e.target.value);
                      if (e.target.value) {
                        const nextD = new Date(new Date(e.target.value).getTime() + 24 * 60 * 60 * 1000);
                        if (!isNaN(nextD.getTime())) {
                          const y = nextD.getFullYear();
                          const m = String(nextD.getMonth() + 1).padStart(2, '0');
                          const d = String(nextD.getDate()).padStart(2, '0');
                          setLeaveJoiningDate(`${y}-${m}-${d}`);
                        }
                      }
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Joining Date (Re-joining duty after leave):
                </label>
                <input
                  type="date"
                  value={leaveJoiningDate}
                  onChange={(e) => setLeaveJoiningDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>Date employee returns and rejoins duty after leave</span>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>Reason:</label>
                <textarea
                  rows={3}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Explain reason for leave..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingLeave}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {isSubmittingLeave ? 'Submitting...' : 'Submit Leave Application'}
              </button>
            </form>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>
              Recent Leave History ({Math.min(5, myLeaves.length)}{myLeaves.length > 5 ? ` of ${myLeaves.length}` : ''})
            </h3>
            {myLeaves.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>No leave requests submitted yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
                {myLeaves.slice(0, 5).map(l => (
                  <div key={l.id} style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{l.leaveType} Leave ({l.daysCount}d)</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: l.status === 'Approved' ? '#f0fdf4' : l.status === 'Rejected' ? '#fef2f2' : '#fefce8',
                        color: l.status === 'Approved' ? '#16a34a' : l.status === 'Rejected' ? '#ef4444' : '#ca8a04'
                      }}>
                        {l.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>📅 Leave: {l.fromDate} to {l.toDate}</div>
                    {(l as any).joiningDate && (
                      <div style={{ fontSize: '12px', color: '#0284c7', fontWeight: 700, marginTop: '2px' }}>
                        🏢 Joining Date: {(l as any).joiningDate}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>{l.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DAILY WORK REPORT */}
      {activeTab === 'reports' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* If already submitted today, show Confirmation Card (Once per day only) */}
          {todayReport ? (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '16px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <CheckCircle size={24} color="#16a34a" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#166534', margin: 0 }}>
                  Today's Work Report Submitted!
                </h3>
              </div>
              <p style={{ fontSize: '13px', color: '#15803d', margin: '4px 0 16px 0' }}>
                You have already submitted your daily work report for today ({todayReport.date}). Daily reports can only be submitted once per day.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', background: '#ffffff', color: '#2563eb', padding: '6px 12px', borderRadius: '6px', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                  📞 {todayReport.totalCalls ?? todayReport.callsCount ?? 0} Total Calls
                </span>
                <span style={{ fontSize: '12px', background: '#ffffff', color: '#16a34a', padding: '6px 12px', borderRadius: '6px', fontWeight: 700, border: '1px solid #bbf7d0' }}>
                  🔄 {todayReport.followUps ?? 0} Follow Ups
                </span>
                <span style={{ fontSize: '12px', background: '#ffffff', color: '#4f46e5', padding: '6px 12px', borderRadius: '6px', fontWeight: 700, border: '1px solid #c7d2fe' }}>
                  👥 {todayReport.contacts ?? 0} Contacts
                </span>
                <span style={{ fontSize: '12px', background: '#ffffff', color: '#ca8a04', padding: '6px 12px', borderRadius: '6px', fontWeight: 700, border: '1px solid #fef08a' }}>
                  ⭐ {todayReport.gReviews ?? todayReport.reviewsCount ?? 0} G-Reviews
                </span>
                <span style={{ fontSize: '12px', background: '#ffffff', color: '#db2777', padding: '6px 12px', borderRadius: '6px', fontWeight: 700, border: '1px solid #fbcfe8' }}>
                  🎥 {todayReport.videoReviews ?? 0} Video Reviews
                </span>
              </div>
              {(todayReport.notes || todayReport.tasksSummary) && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '3px' }}>Notes / Remarks:</div>
                  <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: '1.4' }}>{todayReport.notes || todayReport.tasksSummary}</div>
                </div>
              )}
              <div style={{ fontSize: '11px', color: '#059669', marginTop: '14px', fontWeight: 700 }}>
                Submitted at: {new Date(todayReport.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ) : (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Submit Daily Work Report</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '-8px 0 14px 0' }}>
                Enter your daily performance metrics. Can be submitted once per day.
              </p>
              <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Row 1: Total Calls & Follow Ups */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>Total Calls:</label>
                    <input
                      type="number"
                      value={totalCalls}
                      onChange={(e) => setTotalCalls(e.target.value)}
                      placeholder="e.g. 35"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>Follow Ups:</label>
                    <input
                      type="number"
                      value={followUps}
                      onChange={(e) => setFollowUps(e.target.value)}
                      placeholder="e.g. 18"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Row 2: Contacts & G-Reviews */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>Contacts:</label>
                    <input
                      type="number"
                      value={contacts}
                      onChange={(e) => setContacts(e.target.value)}
                      placeholder="e.g. 12"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>G-Reviews (Google):</label>
                    <input
                      type="number"
                      value={gReviews}
                      onChange={(e) => setGReviews(e.target.value)}
                      placeholder="e.g. 4"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    />
                  </div>
                </div>

                {/* Row 3: Video Reviews */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>Video Reviews:</label>
                  <input
                    type="number"
                    value={videoReviews}
                    onChange={(e) => setVideoReviews(e.target.value)}
                    placeholder="e.g. 2"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>

                {/* Row 4: Work Notes / Remarks Text Box */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Work Notes / Remarks:
                  </label>
                  <textarea
                    rows={3}
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    placeholder="Enter summary of today's work, notes, follow-up comments or patient updates..."
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', resize: 'vertical' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  style={{
                    background: '#258ec8',
                    color: '#ffffff',
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginTop: '4px'
                  }}
                >
                  {isSubmittingReport ? 'Submitting...' : 'Submit Daily Report'}
                </button>
              </form>
            </div>
          )}

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>My Submitted Reports</h3>
            {myReports.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>No daily reports submitted yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
                {myReports.map(rep => (
                  <div key={rep.id} style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>Date: {rep.date}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(rep.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {/* 5 metrics badge pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '6px 0' }}>
                      <span style={{ fontSize: '11px', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        📞 {rep.totalCalls ?? rep.callsCount ?? 0} Calls
                      </span>
                      <span style={{ fontSize: '11px', background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        🔄 {rep.followUps ?? 0} Follow Ups
                      </span>
                      <span style={{ fontSize: '11px', background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        👥 {rep.contacts ?? 0} Contacts
                      </span>
                      <span style={{ fontSize: '11px', background: '#fefce8', color: '#ca8a04', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        ⭐ {rep.gReviews ?? rep.reviewsCount ?? 0} G-Reviews
                      </span>
                      <span style={{ fontSize: '11px', background: '#fdf2f8', color: '#db2777', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        🎥 {rep.videoReviews ?? 0} Video Reviews
                      </span>
                    </div>
                    {(rep.notes || rep.tasksSummary) && (
                      <div style={{ marginTop: '6px', padding: '6px 10px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '2px' }}>Notes:</div>
                        <div style={{ fontSize: '12px', color: '#334155', lineHeight: '1.4' }}>{rep.notes || rep.tasksSummary}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: MONTHLY ATTENDANCE LOG */}
      {activeTab === 'history' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>Monthly Attendance Records</h3>
          {allAttendance.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>No punch records available.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px' }}>Date</th>
                    <th style={{ padding: '10px' }}>Punch In</th>
                    <th style={{ padding: '10px' }}>Punch Out</th>
                    <th style={{ padding: '10px' }}>Hours</th>
                    <th style={{ padding: '10px' }}>Location</th>
                    <th style={{ padding: '10px' }}>Photo</th>
                    <th style={{ padding: '10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allAttendance.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{item.date}</td>
                      <td style={{ padding: '10px', color: '#16a34a', fontWeight: 700 }}>{item.punchInTime || '--:--'}</td>
                      <td style={{ padding: '10px', color: item.punchOutTime ? '#dc2626' : '#94a3b8' }}>{item.punchOutTime || '--:--'}</td>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{item.workingHours || '--'}</td>
                      <td style={{ padding: '10px', fontSize: '11px', color: '#0f766e' }}>{item.punchInLocation?.address || 'Clinic'}</td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {item.punchInPhoto && (
                            <button
                              onClick={() => setPreviewPhotoUrl(item.punchInPhoto || null)}
                              title="View In Selfie"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              <img src={item.punchInPhoto} alt="In" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #16a34a' }} />
                            </button>
                          )}
                          {(item as any).punchOutPhoto && (
                            <button
                              onClick={() => setPreviewPhotoUrl((item as any).punchOutPhoto || null)}
                              title="View Out Selfie"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              <img src={(item as any).punchOutPhoto} alt="Out" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #dc2626' }} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '4px' }}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhotoUrl && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '20px', maxWidth: '340px', textAlign: 'center' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 800 }}>Punch-In Selfie Verification</h4>
            <img src={previewPhotoUrl} alt="Selfie Verification" style={{ width: '260px', height: '260px', borderRadius: '12px', objectFit: 'cover' }} />
            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => setPreviewPhotoUrl(null)}
                style={{ background: '#0f172a', color: '#ffffff', border: 'none', padding: '8px 24px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
