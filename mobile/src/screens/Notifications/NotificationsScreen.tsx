import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
export interface NotificationItem {
  id: string;
  type?: 'booking' | 'payment' | 'staff_login' | 'staff_logout' | 'staff_report' | 'staff_punch_in' | 'staff_punch_out' | string;
  title?: string;
  body?: string;
  patientName?: string;
  staffName?: string;
  staffId?: string;
  appointmentTime?: string;
  appointmentDate?: string;
  branch?: string;
  targetBranch?: string;
  doctorName?: string;
  consultationMode?: string;
  amount?: number | string;
  paymentMode?: string;
  loginTime?: string;
  logoutTime?: string;
  punchInTime?: string;
  punchOutTime?: string;
  workingHours?: string;
  locationAddress?: string;
  totalCalls?: number | string;
  followUps?: number | string;
  photoCount?: number;
  status?: string;
  rejectReason?: string;
  createdAt?: string;
}
interface NotificationsScreenProps {
  notifications: NotificationItem[];
  readNotiIds: Set<string>;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onBack?: () => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  notifications,
  readNotiIds,
  onMarkAsRead,
  onMarkAllAsRead,
}) => {
  // Show ONLY the latest 10 notifications
  const latest10 = useMemo(() => {
    return (notifications || []).slice(0, 10);
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return latest10.filter((n) => !readNotiIds.has(n.id)).length;
  }, [latest10, readNotiIds]);

  const formatTimestamp = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  const getNotificationMeta = (item: NotificationItem, isRead: boolean) => {
    switch (item.type) {
      case 'booking':
        return {
          iconName: 'calendar-outline' as const,
          iconColor: isRead ? '#64748b' : '#0284c7',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleUnread,
          title: item.patientName || 'Appointment Booked',
          tagText: 'BOOKED',
          tagStyle: styles.bookingTypeTag,
          tagTextStyle: styles.bookingTypeTagText,
        };
      case 'payment':
        return {
          iconName: 'cash' as const,
          iconColor: isRead ? '#64748b' : '#16a34a',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCirclePayment,
          title: item.patientName || 'Payment Received',
          tagText: 'PAID',
          tagStyle: styles.paymentTypeTag,
          tagTextStyle: styles.paymentTypeTagText,
        };
      case 'staff_login':
        return {
          iconName: 'log-in-outline' as const,
          iconColor: isRead ? '#64748b' : '#7c3aed',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleLogin,
          title: item.staffName || 'Staff Member',
          tagText: 'LOGIN',
          tagStyle: styles.loginTypeTag,
          tagTextStyle: styles.loginTypeTagText,
        };
      case 'staff_logout':
        return {
          iconName: 'log-out-outline' as const,
          iconColor: isRead ? '#64748b' : '#d97706',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleLogout,
          title: item.staffName || 'Staff Member',
          tagText: 'LOGOUT',
          tagStyle: styles.logoutTypeTag,
          tagTextStyle: styles.logoutTypeTagText,
        };
      case 'staff_punch_in':
        return {
          iconName: 'finger-print-outline' as const,
          iconColor: isRead ? '#64748b' : '#16a34a',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCirclePayment,
          title: item.staffName || 'Staff Member',
          tagText: 'PUNCH IN',
          tagStyle: styles.punchInTypeTag,
          tagTextStyle: styles.punchInTypeTagText,
        };
      case 'staff_punch_out':
        return {
          iconName: 'hand-left-outline' as const,
          iconColor: isRead ? '#64748b' : '#dc2626',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleRejected,
          title: item.staffName || 'Staff Member',
          tagText: 'PUNCH OUT',
          tagStyle: styles.punchOutTypeTag,
          tagTextStyle: styles.punchOutTypeTagText,
        };
      case 'staff_report':
        return {
          iconName: 'document-text-outline' as const,
          iconColor: isRead ? '#64748b' : '#4f46e5',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleReport,
          title: item.staffName ? `${item.staffName} (Report)` : 'Daily Report',
          tagText: 'REPORT',
          tagStyle: styles.reportTypeTag,
          tagTextStyle: styles.reportTypeTagText,
        };
      case 'cleaning_submission':
        return {
          iconName: 'images-outline' as const,
          iconColor: isRead ? '#64748b' : '#0284c7',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleCleaning,
          title: item.title || `${item.branch || 'Branch'} Cleaning Photos`,
          tagText: 'CLEANING',
          tagStyle: styles.cleaningTypeTag,
          tagTextStyle: styles.cleaningTypeTagText,
        };
      case 'cleaning_approved':
        return {
          iconName: 'checkmark-circle-outline' as const,
          iconColor: isRead ? '#64748b' : '#16a34a',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCirclePayment,
          title: item.title || `${item.branch || 'Branch'} Cleaning Approved`,
          tagText: 'APPROVED',
          tagStyle: styles.paymentTypeTag,
          tagTextStyle: styles.paymentTypeTagText,
        };
      case 'cleaning_rejected':
        return {
          iconName: 'alert-circle-outline' as const,
          iconColor: isRead ? '#64748b' : '#dc2626',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleRejected,
          title: item.title || `${item.branch || 'Branch'} Cleaning Rejected`,
          tagText: 'REJECTED',
          tagStyle: styles.rejectedTypeTag,
          tagTextStyle: styles.rejectedTypeTagText,
        };
      case 'staff_leave_request':
        return {
          iconName: 'calendar-outline' as const,
          iconColor: isRead ? '#64748b' : '#ec4899',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleLeave,
          title: item.staffName ? `${item.staffName} (Leave)` : 'Leave Application',
          tagText: 'LEAVE',
          tagStyle: styles.leaveTypeTag,
          tagTextStyle: styles.leaveTypeTagText,
        };
      case 'fee_discount_request':
        return {
          iconName: 'pricetag-outline' as const,
          iconColor: isRead ? '#64748b' : '#8b5cf6',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleLogin,
          title: item.patientName ? `${item.patientName} (Discount Req)` : 'Discount Request',
          tagText: 'DISCOUNT REQ',
          tagStyle: styles.discountReqTypeTag,
          tagTextStyle: styles.discountReqTypeTagText,
        };
      case 'fee_discount_response': {
        const isApproved = item.status === 'approved';
        return {
          iconName: (isApproved ? 'checkmark-circle-outline' : 'close-circle-outline') as any,
          iconColor: isRead ? '#64748b' : (isApproved ? '#16a34a' : '#dc2626'),
          circleStyle: isRead ? styles.iconCircleRead : (isApproved ? styles.iconCirclePayment : styles.iconCircleRejected),
          title: item.patientName ? `${item.patientName} (Discount)` : 'Discount Decision',
          tagText: isApproved ? 'DISCOUNT APPROVED' : 'DISCOUNT REJECTED',
          tagStyle: isApproved ? styles.paymentTypeTag : styles.rejectedTypeTag,
          tagTextStyle: isApproved ? styles.paymentTypeTagText : styles.rejectedTypeTagText,
        };
      }
      default:
        return {
          iconName: 'calendar-outline' as const,
          iconColor: isRead ? '#64748b' : '#0284c7',
          circleStyle: isRead ? styles.iconCircleRead : styles.iconCircleUnread,
          title: item.patientName || 'Patient',
          tagText: null,
          tagStyle: null,
          tagTextStyle: null,
        };
    }
  };

  return (
    <View style={styles.container}>
      {/* Sub-toolbar: count + mark all as read */}
      <View style={styles.topHeaderBar}>
        <View style={styles.titleInfo}>
          <Text style={styles.subBarLabel}>Showing latest {latest10.length}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={onMarkAllAsRead}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-done" size={13} color="#0284c7" />
            <Text style={styles.markAllBtnText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications List (Top 10 Only) */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {latest10.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="notifications-off-outline" size={36} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySubtitle}>
              New appointment bookings and alerts will appear here in real-time.
            </Text>
          </View>
        ) : (
          latest10.map((item, index) => {
            const isRead = readNotiIds.has(item.id);
            const meta = getNotificationMeta(item, isRead);

            return (
              <TouchableOpacity
                key={item.id || index}
                activeOpacity={0.75}
                style={[styles.card, isRead ? styles.cardRead : styles.cardUnread]}
                onPress={() => {
                  if (!isRead) onMarkAsRead(item.id);
                }}
              >
                {/* Header Row: Icon + Title + Tag (Left) | Time + Unread Dot (Right) */}
                <View style={styles.cardHeader}>
                  <View style={styles.headerLeft}>
                    <View style={[styles.iconCircle, meta.circleStyle]}>
                      <Ionicons
                        name={meta.iconName}
                        size={12}
                        color={meta.iconColor}
                      />
                    </View>
                    <Text style={[styles.patientName, isRead && styles.textMuted]} numberOfLines={1}>
                      {meta.title}
                    </Text>
                    {meta.tagText && meta.tagStyle && meta.tagTextStyle && (
                      <View style={meta.tagStyle}>
                        <Text style={meta.tagTextStyle}>{meta.tagText}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.headerRight}>
                    <Text style={styles.timeText}>{formatTimestamp(item.createdAt)}</Text>
                    {!isRead && <View style={styles.unreadDot} />}
                  </View>
                </View>

                {/* Body Text */}
                <Text style={[styles.bodyText, isRead && styles.bodyTextRead]} numberOfLines={2}>
                  {item.body || (item.type === 'payment'
                    ? `Payment received from ${item.patientName || 'Patient'}`
                    : `Appointment booked for ${item.patientName || 'Patient'}`)}
                </Text>

                {/* Details Tags */}
                {(item.amount != null || item.appointmentTime || item.branch || item.doctorName || item.paymentMode || item.loginTime || item.logoutTime || item.totalCalls || item.followUps || item.photoCount || item.status) && (
                  <View style={styles.tagsContainer}>
                    {item.amount != null && item.amount !== '' ? (
                      <View style={styles.tagAmount}>
                        <Ionicons name="wallet-outline" size={10} color="#16a34a" />
                        <Text style={styles.tagTextAmount}>₹{Number(item.amount || 0).toLocaleString('en-IN')}</Text>
                      </View>
                    ) : null}

                    {item.photoCount ? (
                      <View style={styles.tagBlue}>
                        <Ionicons name="images-outline" size={10} color="#0284c7" />
                        <Text style={styles.tagTextBlue}>{item.photoCount} Photos</Text>
                      </View>
                    ) : null}

                    {item.status ? (
                      <View style={item.status === 'approved' ? styles.tagGreen : item.status === 'rejected' ? styles.tagAmber : styles.tagBlue}>
                        <Text style={item.status === 'approved' ? styles.tagTextGreen : item.status === 'rejected' ? styles.tagTextAmber : styles.tagTextBlue}>
                          {item.status.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}

                    {item.paymentMode ? (
                      <View style={styles.tag}>
                        <Ionicons name="card-outline" size={10} color="#475569" />
                        <Text style={styles.tagTextSecondary}>{item.paymentMode}</Text>
                      </View>
                    ) : null}

                    {item.loginTime ? (
                      <View style={styles.tagPurple}>
                        <Ionicons name="log-in-outline" size={10} color="#7c3aed" />
                        <Text style={styles.tagTextPurple}>In: {item.loginTime}</Text>
                      </View>
                    ) : null}

                    {item.logoutTime ? (
                      <View style={styles.tagAmber}>
                        <Ionicons name="log-out-outline" size={10} color="#d97706" />
                        <Text style={styles.tagTextAmber}>Out: {item.logoutTime}</Text>
                      </View>
                    ) : null}

                    {item.punchInTime ? (
                      <View style={styles.tagGreen}>
                        <Ionicons name="finger-print-outline" size={10} color="#059669" />
                        <Text style={styles.tagTextGreen}>In: {item.punchInTime}</Text>
                      </View>
                    ) : null}

                    {item.punchOutTime ? (
                      <View style={styles.tagRed}>
                        <Ionicons name="hand-left-outline" size={10} color="#dc2626" />
                        <Text style={styles.tagTextRed}>Out: {item.punchOutTime}</Text>
                      </View>
                    ) : null}

                    {item.workingHours ? (
                      <View style={styles.tagBlue}>
                        <Ionicons name="time-outline" size={10} color="#0284c7" />
                        <Text style={styles.tagTextBlue}>Worked: {item.workingHours}</Text>
                      </View>
                    ) : null}

                    {item.locationAddress ? (
                      <View style={styles.tag}>
                        <Ionicons name="navigate-outline" size={10} color="#64748b" />
                        <Text style={styles.tagTextSecondary} numberOfLines={1}>{item.locationAddress}</Text>
                      </View>
                    ) : null}

                    {item.totalCalls != null && item.totalCalls !== '' && Number(item.totalCalls) > 0 ? (
                      <View style={styles.tagIndigo}>
                        <Ionicons name="call-outline" size={10} color="#4f46e5" />
                        <Text style={styles.tagTextIndigo}>{item.totalCalls} Calls</Text>
                      </View>
                    ) : null}

                    {item.followUps != null && item.followUps !== '' && Number(item.followUps) > 0 ? (
                      <View style={styles.tagGreen}>
                        <Ionicons name="people-outline" size={10} color="#059669" />
                        <Text style={styles.tagTextGreen}>{item.followUps} Follow-ups</Text>
                      </View>
                    ) : null}

                    {item.appointmentTime ? (
                      <View style={styles.tag}>
                        <Ionicons name="time-outline" size={10} color="#0284c7" />
                        <Text style={styles.tagTextPrimary}>{item.appointmentTime}</Text>
                      </View>
                    ) : null}

                    {item.branch ? (
                      <View style={styles.tag}>
                        <Ionicons name="location-outline" size={10} color="#64748b" />
                        <Text style={styles.tagTextSecondary}>{item.branch}</Text>
                      </View>
                    ) : null}

                    {item.doctorName ? (
                      <View style={styles.tag}>
                        <Ionicons name="medkit-outline" size={10} color="#0284c7" />
                        <Text style={styles.tagTextDoctor}>{item.doctorName}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  titleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  subBarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  unreadBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#dc2626',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  markAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 7,
    borderWidth: 1,
  },
  cardUnread: {
    borderColor: '#bae6fd',
    borderLeftWidth: 3.5,
    borderLeftColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardRead: {
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleUnread: {
    backgroundColor: '#e0f2fe',
  },
  iconCircleCleaning: {
    backgroundColor: '#e0f2fe',
  },
  iconCircleRejected: {
    backgroundColor: '#fee2e2',
  },
  iconCirclePayment: {
    backgroundColor: '#dcfce7',
  },
  iconCircleLogin: {
    backgroundColor: '#ede9fe',
  },
  iconCircleLogout: {
    backgroundColor: '#fef3c7',
  },
  iconCircleReport: {
    backgroundColor: '#e0e7ff',
  },
  iconCircleRead: {
    backgroundColor: '#f1f5f9',
  },
  iconCircleLeave: {
    backgroundColor: '#fce7f3',
  },
  leaveTypeTag: {
    backgroundColor: '#fce7f3',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  leaveTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#be185d',
  },
  discountReqTypeTag: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  discountReqTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#7c3aed',
  },
  cleaningTypeTag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  cleaningTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#0369a1',
  },
  rejectedTypeTag: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  rejectedTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#dc2626',
  },
  bookingTypeTag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  bookingTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#0284c7',
  },
  paymentTypeTag: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  paymentTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#15803d',
  },
  loginTypeTag: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  loginTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#7c3aed',
  },
  logoutTypeTag: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  logoutTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#d97706',
  },
  punchInTypeTag: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  punchInTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#15803d',
  },
  punchOutTypeTag: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  punchOutTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#dc2626',
  },
  reportTypeTag: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  reportTypeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#4f46e5',
  },
  patientName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    flexShrink: 1,
  },
  unreadDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
    backgroundColor: '#0284c7',
  },
  timeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94a3b8',
  },
  bodyText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 5,
  },
  bodyTextRead: {
    color: '#64748b',
  },
  textMuted: {
    color: '#475569',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f8fafc',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  tagAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f0fdf4',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  tagTextAmount: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
  },
  tagPurple: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f5f3ff',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  tagTextPurple: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7c3aed',
  },
  tagAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fffbeb',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  tagTextAmber: {
    fontSize: 10,
    fontWeight: '700',
    color: '#d97706',
  },
  tagIndigo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#eef2ff',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  tagTextIndigo: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4f46e5',
  },
  tagGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f0fdf4',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  tagTextGreen: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  tagRed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fef2f2',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  tagTextRed: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
  },
  tagBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f0f9ff',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  tagTextBlue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  tagTextPrimary: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  tagTextSecondary: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  tagTextDoctor: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0369a1',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
  },
});
