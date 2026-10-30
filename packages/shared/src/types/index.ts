import { CanonicalBranchId, BranchRegistrationCode } from '../branches/branchMaster';

export type UserRole = 'admin' | 'doctor' | 'reception' | 'staff' | 'hr' | 'patient' | 'telecaller';

export interface Branch {
  id: CanonicalBranchId | string;
  name: string;
  phone: string;
  formattedPhone: string;
  receptionistRole: 'reception';
  registrationCode?: BranchRegistrationCode;
}

// Officially Authorized 4 SPH Receptionist Branches
export const SPH_OFFICIAL_BRANCHES: Record<CanonicalBranchId, Branch> = {
  kphb: {
    id: 'kphb',
    name: 'KPHB Branch',
    phone: '9030176176',
    formattedPhone: '+91 90301 76176',
    receptionistRole: 'reception',
    registrationCode: 'KPB',
  },
  nallagandla: {
    id: 'nallagandla',
    name: 'Nallagandla Branch',
    phone: '9132176176',
    formattedPhone: '+91 91321 76176',
    receptionistRole: 'reception',
    registrationCode: 'NGL',
  },
  dilshuknagar: {
    id: 'dilshuknagar',
    name: 'Dilshuknagar Branch',
    phone: '9804176176',
    formattedPhone: '+91 98041 76176',
    receptionistRole: 'reception',
    registrationCode: 'DIL',
  },
  chandanagar: {
    id: 'chandanagar',
    name: 'Chandanagar Branch',
    phone: '9553176176',
    formattedPhone: '+91 95531 76176',
    receptionistRole: 'reception',
    registrationCode: 'CHN',
  },
};

export interface AuthUserSession {
  uid?: string;
  role: UserRole;
  userName?: string;
  branchId: CanonicalBranchId;
  branchName: string;
  branchPhone: string;
  staffId?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  phone?: string;
  role: UserRole;
  branchId?: CanonicalBranchId | string;
  photoURL?: string;
  createdAt: string;
}

export interface TelecallerProfile {
  id?: string;
  uid?: string;
  telecallerId: string;
  name: string;
  email: string;
  phone: string;
  role: 'telecaller';
  isActive: boolean;
  assignedBranch?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelecallerActivity {
  id?: string;
  activityId?: string;
  telecallerUid?: string;
  telecallerId: string;
  telecallerName: string;
  patientId: string;
  patientName: string;
  patientMobile: string;
  branchId: string;
  branchName: string;
  activityType: 'call_logged' | 'status_updated' | 'rescheduled' | 'appointment_booked' | 'remark_added';
  previousStatus?: string;
  newStatus?: string;
  callOutcome?: string;
  remarks?: string;
  followUpId?: string;
  appointmentId?: string;
  appointmentDate?: string;
  nextFollowUpDate?: string;
  createdAt: string;
  createdAtMs: number;
}

export const DEFAULT_TELECALLERS = [
  {
    id: "telecaller_TC01",
    telecallerId: "TC01",
    name: "Telecaller Desk",
    email: "telecaller@sph.com",
    phone: "9000012345",
    role: "telecaller" as const,
    isActive: true,
    assignedBranch: "All Branches",
    password: "email123",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

export interface Remedy {
  id?: string;
  name: string;
  latinName?: string;
  category: 'Spiritual' | 'Acute' | 'Chronic' | 'General';
  symptoms: string[];
  potencyOptions: string[];
  description: string;
  spiritualInsight?: string;
  dosageInstructions?: string;
  stockCount?: number;
  imageUrl?: string;
}

export interface ConsultationAppointment {
  id?: string;
  userId: string;
  userName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  consultationType: 'Spiritual Consultation' | 'Homeopathic Remedy' | 'Holistic Healing';
  status: 'scheduled' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  prescription?: string;
  createdAt?: any;
}

export interface StaffShift {
  id?: string;
  staffName: string;
  role: UserRole;
  shiftDate: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'completed' | 'absent';
}

export interface FirebaseConfigOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface StaffAttendanceRecord {
  id?: string;
  staffId: string;
  staffName: string;
  role?: string;
  branch: string;
  date: string;
  punchInTime: string;
  punchInLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  punchInPhoto?: string;
  punchOutTime?: string;
  punchOutLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  workingHours?: string;
  status: 'Present' | 'Half Day' | 'Late' | 'Completed';
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffLeaveRequest {
  id?: string;
  staffId: string;
  staffName: string;
  branch: string;
  leaveType: 'Casual' | 'Sick' | 'Privilege' | 'Emergency' | 'Half Day';
  fromDate: string;
  toDate: string;
  daysCount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

export interface StaffDailyReport {
  id?: string;
  staffId: string;
  staffName: string;
  branch: string;
  date: string;
  totalCalls: number;
  followUps: number;
  contacts: number;
  gReviews: number;
  videoReviews: number;
  tasksSummary?: string;
  notes?: string;
  callsCount?: number;
  reviewsCount?: number;
  submittedAt: string;
}

export interface StaffMemberRecord {
  id: string;
  name: string;
  role: string;
  branch: string;
  phone: string;
  mobile: string;
  email: string;
  password?: string;
  shift?: string;
  hours: string;
  salary: string;
  loginTime?: string;
  logoutTime?: string;
  shiftType?: 'Single Strict' | 'Multi Strict';
}

export const DEFAULT_STAFF_MEMBERS: StaffMemberRecord[] = [
  {
    id: "1",
    name: "Anil Kumar M",
    role: "Regular Staff",
    branch: "KPHB",
    phone: "7338260802",
    mobile: "7338260802",
    email: "anil@sph.com",
    password: "email123",
    hours: "10.5 hrs/day",
    shift: "10:00 AM - 08:30 PM",
    salary: "₹22,000",
    loginTime: "10:00 AM",
    logoutTime: "08:30 PM",
    shiftType: "Single Strict"
  },
  {
    id: "1789155882856",
    name: "Preetham Ram",
    role: "Regular Staff",
    branch: "KPHB",
    phone: "8374062188",
    mobile: "8374062188",
    email: "preetham@sph.com",
    password: "email123",
    hours: "9 hrs/day",
    shift: "09:00 AM - 06:00 PM",
    salary: "₹4,979",
    loginTime: "09:00 AM",
    logoutTime: "06:00 PM",
    shiftType: "Single Strict"
  },
  {
    id: "1789208847947",
    name: "Salman",
    role: "Regular Staff",
    branch: "Nallagandla",
    phone: "7842836959",
    mobile: "7842836959",
    email: "salman@sph.com",
    password: "email123",
    hours: "9 hrs/day",
    shift: "09:00 AM - 06:00 PM",
    salary: "₹4,998",
    loginTime: "09:00 AM",
    logoutTime: "06:00 PM",
    shiftType: "Single Strict"
  },
  {
    id: "2",
    name: "Ashwini Begari",
    role: "Regular Staff",
    branch: "Chandanagar",
    phone: "6302121265",
    mobile: "6302121265",
    email: "ashwini@sph.com",
    password: "email123",
    hours: "8.5 hrs/day",
    shift: "10:00 AM - 06:30 PM",
    salary: "₹17,000",
    loginTime: "10:00 AM",
    logoutTime: "06:30 PM",
    shiftType: "Single Strict"
  },
  {
    id: "3",
    name: "Vaishnavi Peri",
    role: "Regular Staff",
    branch: "Nallagandla",
    phone: "9874563210",
    mobile: "9874563210",
    email: "vaishnavi@sph.com",
    password: "email123",
    hours: "9.5 hrs/day",
    shift: "09:30 AM - 07:00 PM",
    salary: "₹17,000",
    loginTime: "09:30 AM",
    logoutTime: "07:00 PM",
    shiftType: "Single Strict"
  },
  {
    id: "4",
    name: "Nandini Gottelli",
    role: "Regular Staff",
    branch: "Dilshuknagar",
    phone: "9652180003",
    mobile: "9652180003",
    email: "nandini@sph.com",
    password: "email123",
    hours: "8 hrs/day",
    shift: "10:00 AM - 02:00 PM | 04:30 PM - 08:30 PM",
    salary: "₹15,000",
    loginTime: "10:00 AM",
    logoutTime: "08:30 PM",
    shiftType: "Multi Strict"
  },
  {
    id: "5",
    name: "Srikanth",
    role: "Regular Staff",
    branch: "KPHB",
    phone: "8125384387",
    mobile: "8125384387",
    email: "srikanth@sph.com",
    password: "email123",
    hours: "10 hrs/day",
    shift: "10:00 AM - 08:00 PM",
    salary: "₹18,000",
    loginTime: "10:00 AM",
    logoutTime: "08:00 PM",
    shiftType: "Single Strict"
  },
  {
    id: "6",
    name: "Arun Kumar",
    role: "Regular Staff",
    branch: "Nallagandla",
    phone: "9876543212",
    mobile: "9876543212",
    email: "arun@sph.com",
    password: "email123",
    hours: "8 hrs/day",
    shift: "10:00 AM - 06:00 PM",
    salary: "₹14,000",
    loginTime: "10:00 AM",
    logoutTime: "06:00 PM",
    shiftType: "Single Strict"
  },
  {
    id: "7",
    name: "Aishwarya . M",
    role: "Regular Staff",
    branch: "KPHB",
    phone: "7890123456",
    mobile: "7890123456",
    email: "aishwarya@sph.com",
    password: "email123",
    hours: "10.5 hrs/day",
    shift: "10:00 AM - 08:30 PM",
    salary: "₹14,000",
    loginTime: "10:00 AM",
    logoutTime: "08:30 PM",
    shiftType: "Single Strict"
  }
];
