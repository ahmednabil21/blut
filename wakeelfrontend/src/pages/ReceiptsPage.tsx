import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { useDigits } from '../contexts/DigitsContext';
import { apiService, ApiService } from '../services/api';
import { useMyAgent } from '../hooks/useMyAgent';
import type { ActivationInvoicePrintSettingsDto } from '../types';
import {
  buildActivationReceiptPrintHtml,
  renewalLikeToActivationPrintPayload,
} from '../utils/activationReceiptPrintHtml';
import { isPythonBackend } from '../config/apiConfig';
import { fetchReceiptsWithCache } from '../services/offlineSync';
import {
  formatActivationMethodAr,
  getMasterTypeBadgeClass,
  mapActivationToRenewalReceipt,
  sortActivationRecordsNewestFirst,
} from '../utils/activationRecord';
import { getSelectedResellerId, setSelectedResellerId } from '../utils/selectedReseller';
import { RenewalReceipt, PaymentStatus, ActivationType, AgentReseller, UserRole } from '../types';
import WifiLoaderComponent from '../components/WifiLoaderComponent';
import { 
  Search, 
  Receipt,
  Calendar,
  User,
  Phone,
  Eye,
  Printer,
  X,
  FileSpreadsheet,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';

const ReceiptsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { online } = useOffline();
  const { formatNumber, formatDate, locale } = useDigits();
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<RenewalReceipt | null>(null);
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => (isPythonBackend() ? 50 : 10));
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [masterTypeFilter, setMasterTypeFilter] = useState('');
  const [appliedMasterType, setAppliedMasterType] = useState('');
  const [activationMethodFilter, setActivationMethodFilter] = useState('');
  const [appliedActivationMethod, setAppliedActivationMethod] = useState('');
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [sasRequestBody, setSasRequestBody] = useState<Record<string, unknown> | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const pythonBackend = isPythonBackend();
  const [selectedOperationalResellerId, setSelectedOperationalResellerId] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: myAgent } = useMyAgent(!!isAuthenticated);

  const isAgentOrSubAgentOrEmployee =
    user?.role === UserRole.Agent || user?.role === UserRole.SubAgent || user?.role === UserRole.Employee;

  const { data: myResellers = [] } = useQuery<AgentReseller[]>({
    queryKey: ['myResellers'],
    queryFn: () => apiService.getMyResellers(),
    enabled: isAuthenticated && !!isAgentOrSubAgentOrEmployee,
    retry: false,
  });

  useEffect(() => {
    if (!isAgentOrSubAgentOrEmployee || myResellers.length === 0) return;
    const current = (selectedOperationalResellerId || getSelectedResellerId() || '').trim();
    const valid = current && myResellers.some((r) => r.id === current);
    const next = valid ? current : myResellers[0].id;
    if (selectedOperationalResellerId === next) return;
    setSelectedOperationalResellerId(next);
    setSelectedResellerId(next);
    if (pythonBackend) {
      void apiService.selectApiReseller(next).catch(() => undefined);
    }
  }, [isAgentOrSubAgentOrEmployee, myResellers, selectedOperationalResellerId, pythonBackend]);

  const { data: activationTypesData } = useQuery({
    queryKey: ['activation-types'],
    queryFn: () => apiService.getActivationTypes(),
    enabled: pythonBackend && isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activateModesData } = useQuery({
    queryKey: ['activate-modes', 'receipts', selectedOperationalResellerId],
    queryFn: () => apiService.getActivateModes(),
    enabled: pythonBackend && isAuthenticated && !!selectedOperationalResellerId,
    retry: false,
  });

  const activationMethodOptions = useMemo(
    () => activationTypesData?.activation_methods ?? [],
    [activationTypesData?.activation_methods]
  );

  const activationsHistoryHint = activateModesData?.config?.activations_history;

  /** بحث محلي على الصفحة الحالية فقط */
  const filterReceiptsSearchLocally = (list: RenewalReceipt[]): RenewalReceipt[] => {
    let out = list;
    const term = appliedSearchTerm.trim().toLowerCase();
    if (term) {
      out = out.filter((r) => {
        const name = (r.subscriberName ?? '').toLowerCase();
        const username = (r.subscriberUsername ?? '').toLowerCase();
        const pin = (r.activationPin ?? r.receiptNumber ?? '').toLowerCase();
        const tx = (r.activationTransaction ?? '').toLowerCase();
        return name.includes(term) || username.includes(term) || pin.includes(term) || tx.includes(term);
      });
    }
    return out;
  };

  const { data: receiptsData, error, isLoading } = useQuery<{
    receipts: RenewalReceipt[];
    pagination: unknown;
  }>({
    queryKey: [
      pythonBackend ? 'activations' : 'renewal-receipts',
      'offline',
      online,
      currentPage,
      pageSize,
      pythonBackend ? null : appliedFromDate || null,
      pythonBackend ? null : appliedToDate || null,
      selectedOperationalResellerId || null,
      appliedSearchTerm || null,
      appliedMasterType || null,
      appliedActivationMethod || null,
      pythonBackend ? selectedOperationalResellerId || null : null,
    ],
    queryFn: async () => {
      if (pythonBackend) {
        const res = await apiService.getActivations({
          page: currentPage,
          per_page: pageSize,
          activation_method: appliedActivationMethod.trim() || undefined,
          master_type: appliedMasterType || undefined,
        });
        const receipts = sortActivationRecordsNewestFirst(res.data).map(mapActivationToRenewalReceipt);
        setTotalItems(res.totalItems ?? receipts.length);
        setTotalPages(res.totalPages ?? 1);
        setSasRequestBody(res.sas_request_body ?? null);
        return {
          receipts: filterReceiptsSearchLocally(receipts),
          pagination: {
            totalItems: res.totalItems,
            totalPages: res.totalPages,
            currentPage: res.currentPage,
          },
        };
      }
      const data = await fetchReceiptsWithCache(
        online,
        currentPage,
        pageSize,
        appliedFromDate || undefined,
        appliedToDate || undefined,
        selectedOperationalResellerId || undefined,
        appliedSearchTerm || undefined
      );
      if (data.pagination) {
        setTotalItems(data.pagination.totalItems ?? 0);
        setTotalPages(data.pagination.totalPages ?? 0);
        setCurrentPage(data.pagination.currentPage ?? 1);
      }
      return data;
    },
    enabled: isAuthenticated,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // استخراج الفواتير من البيانات
  const receipts = useMemo(() => receiptsData?.receipts || [], [receiptsData?.receipts]);

  /** مع الاتصال: الباكند يصفّي بـ searchTerm (.NET). Python: تصفية محلية على الصفحة بعد الجلب. */
  const displayReceipts = useMemo(() => {
    if (!Array.isArray(receipts)) return [];
    if (pythonBackend) return receipts;
    if (online || !appliedSearchTerm.trim()) return receipts;
    const term = appliedSearchTerm.trim().toLowerCase();
    const raw = appliedSearchTerm.trim();
    return receipts.filter((receipt) => {
      const name = (receipt.subscriberName ?? '').toLowerCase();
      const number = (receipt.receiptNumber ?? '').toLowerCase();
      const phone = receipt.subscriberPhone ?? '';
      const username = (receipt.subscriberUsername ?? '').toLowerCase();
      return (
        name.includes(term) ||
        number.includes(term) ||
        phone.includes(raw) ||
        username.includes(term)
      );
    });
  }, [receipts, online, appliedSearchTerm, pythonBackend]);

  // تسجيل حالة المصادقة
  useEffect(() => {
    console.log('ReceiptsPage mounted');
    console.log('isAuthenticated:', isAuthenticated);
    console.log('user:', user);
    console.log('token:', localStorage.getItem('token'));
  }, [isAuthenticated, user]);

  // استخدام useEffect للتعامل مع النجاح والفشل
  useEffect(() => {
    if (receipts) {
      console.log('Receipts loaded:', receipts);
    }
  }, [receipts]);

  useEffect(() => {
    if (error) {
      console.error('Error loading receipts:', error);
      
      // التحقق من خطأ المصادقة
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.status === 401) {
          console.error('Authentication failed - user needs to login');
          // يمكن إضافة إشعار للمستخدم هنا
        }
      }
    }
  }, [error]);

  // إذا لم يكن المستخدم مسجل الدخول، إظهار رسالة
  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <User className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">يرجى تسجيل الدخول</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            يجب تسجيل الدخول لعرض التفعيلات
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
          >
            تسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  const hasActiveFilters = pythonBackend
    ? !!(appliedMasterType || appliedActivationMethod || appliedSearchTerm)
    : !!(appliedFromDate || appliedToDate || appliedMasterType || appliedSearchTerm);

  const handleApplyFilters = (closeModal = false) => {
    if (!pythonBackend) {
      setAppliedFromDate(fromDate);
      setAppliedToDate(toDate);
    }
    setAppliedSearchTerm(searchTerm.trim());
    setAppliedMasterType(masterTypeFilter);
    setAppliedActivationMethod(activationMethodFilter);
    setCurrentPage(1);
    if (closeModal) setShowFiltersModal(false);
  };

  const openFiltersModal = () => {
    setMasterTypeFilter(appliedMasterType);
    setActivationMethodFilter(appliedActivationMethod);
    setShowFiltersModal(true);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setAppliedSearchTerm('');
    setMasterTypeFilter('');
    setAppliedMasterType('');
    setActivationMethodFilter('');
    setAppliedActivationMethod('');
    setCurrentPage(1);
    setShowFiltersModal(false);
    setSasRequestBody(null);
    if (!pythonBackend) {
      setFromDate('');
      setToDate('');
      setAppliedFromDate('');
      setAppliedToDate('');
    }
  };

  const renderActivationMethodBadge = (receipt: RenewalReceipt) => {
    const label = receipt.masterTypeLabel?.trim() || '—';
    if (label === '—') {
      return <span className="text-gray-400">—</span>;
    }
    return (
      <span
        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getMasterTypeBadgeClass(
          receipt.masterType,
          receipt.masterTypeLabel
        )}`}
      >
        {label}
      </span>
    );
  };

  const handleResellerChange = async (resellerId: string) => {
    setSelectedOperationalResellerId(resellerId);
    setSelectedResellerId(resellerId || null);
    setCurrentPage(1);
    if (pythonBackend && resellerId) {
      try {
        await apiService.selectApiReseller(resellerId);
      } catch {
        /* يبقى X-Reseller-Id */
      }
      void queryClient.invalidateQueries({ queryKey: ['activations'] });
    }
  };

  console.log('Receipts:', receipts);
  console.log('Display receipts:', displayReceipts);



  const _handleViewReceipt = (receipt: RenewalReceipt) => {
    setSelectedReceipt(receipt);
    setShowReceiptModal(true);
    setShowDropdown(null);
  };
  void _handleViewReceipt;

  const handlePrintReceipt = async (receipt: RenewalReceipt) => {
    setSelectedReceipt(receipt);
    setTimeout(async () => {
      // إنشاء نافذة طباعة جديدة
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const printBase = {
        appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
        apiBaseUrl: apiService.getBaseURL(),
      };

      let settings: ActivationInvoicePrintSettingsDto = {};
      try {
        settings = await apiService.getActivationInvoicePrintSettings(myAgent?.id || undefined);
      } catch {
        settings = {};
      }

      const printContent = buildActivationReceiptPrintHtml(
        settings,
        renewalLikeToActivationPrintPayload(receipt as unknown as Record<string, unknown>),
        {
          formatDate,
          locale,
          ...printBase,
          fallbackOrganizerName: (user?.fullName || user?.username || '').trim() || undefined,
        }
      );

      printWindow.document.write(printContent);
      printWindow.document.close();

      // انتظار تحميل المحتوى ثم الطباعة
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      };
    }, 100);
    setShowDropdown(null);
  };


  const handleRefreshData = () => {
    void queryClient.invalidateQueries({
      queryKey: [pythonBackend ? 'activations' : 'renewal-receipts'],
    });
  };

  // دالة لطباعة الفاتورة كـ PDF من الفرونت إند
  const handlePrintReceiptPDF = async (receiptId: string) => {
    try {
      console.log('Printing PDF for receipt ID:', receiptId);
      
      // البحث عن الفاتورة في البيانات المحملة
      const receipt = receipts?.find(r => r.id === receiptId);
      if (!receipt) {
        alert('لم يتم العثور على الفاتورة المطلوبة');
        return;
      }
      
      // استخدام نفس دالة الطباعة العادية
      await handlePrintReceipt(receipt);
      
    } catch (error: any) {
      console.error('Error printing PDF:', error);
      const errorMessage = ApiService.showError(error);
      alert(errorMessage);
    }
  };

  // دالة لتصدير الفواتير إلى Excel
  const handleExportToExcel = async () => {
    if (pythonBackend) {
      alert('تصدير Excel غير متوفر حالياً في وضع باكند Python.');
      return;
    }
    try {
      setIsExporting(true);
      console.log('Exporting receipts to Excel...');
      
      // استخدام apiService لتصدير البيانات
      const blob = await apiService.exportReceiptsToExcel(
        appliedFromDate || undefined,
        appliedToDate || undefined,
        selectedOperationalResellerId || undefined,
        appliedSearchTerm || undefined
      );
      
      // إنشاء رابط تحميل للملف
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // تحديد اسم الملف
      const fileName = `تفعيلات_${appliedFromDate || 'all'}_${appliedToDate || 'all'}.xlsx`;
      link.download = fileName;
      
      // إضافة الرابط إلى الصفحة وتشغيله
      document.body.appendChild(link);
      link.click();
      
      // تنظيف الرابط
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      // إظهار رسالة نجاح
      alert('تم تحميل ملف Excel بنجاح');
      
    } catch (error: any) {
      console.error('Error exporting to Excel:', error);
      const errorMessage = ApiService.showError(error);
      alert(errorMessage);
      
      if (error.status === 401) {
        navigate('/login');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1); // العودة إلى الصفحة الأولى عند تغيير حجم الصفحة
  };

  const _handleTestData = () => {
  };
  void _handleTestData;

  const handleLoginRedirect = () => {
    // حذف الـ token القديم وإعادة التوجيه إلى صفحة تسجيل الدخول
    localStorage.removeItem('token');
    navigate('/login');
  };

  const _testDirectAPI = async () => {
    try {
      console.log('Testing direct API call...');
      console.log('Current user:', user);
      console.log('User role:', user?.role);
      console.log('API base URL:', apiService.getBaseURL());
      
      const data = await apiService.getRenewalReceipts(currentPage, pageSize);
      console.log('Direct API response:', data);
      console.log('Response type:', typeof data);
      console.log('Receipts:', data.receipts);
      console.log('Pagination:', data.pagination);
      
      if (data.receipts && data.receipts.length > 0) {
        console.log('First receipt:', data.receipts[0]);
        alert(`تم جلب ${data.receipts.length} فاتورة بنجاح\nأول فاتورة: ${data.receipts[0].receiptNumber}\nإجمالي الفواتير: ${data.pagination.totalItems}\nالصفحة الحالية: ${data.pagination.currentPage}/${data.pagination.totalPages}`);
      } else {
        alert(`تم جلب البيانات بنجاح لكن لا توجد فواتير\nالسبب المحتمل:\n1. لا توجد فواتير في النظام\n2. المستخدم غير مخول لعرض الفواتير\n3. مشكلة في الصلاحيات`);
      }
    } catch (error: any) {
      console.error('Direct API error:', error);
      const errorMessage = ApiService.showError(error);
      alert(`خطأ في API: ${errorMessage}`);
    }
  };
  void _testDirectAPI;

  const _getPaymentStatusBadge = (status: PaymentStatus) => {
    const statusConfig = {
      [PaymentStatus.Paid]: { 
        text: 'مدفوع', 
        class: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
      },
      [PaymentStatus.Unpaid]: { 
        text: 'غير مدفوع', 
        class: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' 
      },
      [PaymentStatus.Pending]: { 
        text: 'معلق', 
        class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' 
      },
      [PaymentStatus.Unknown]: { 
        text: 'غير محدد', 
        class: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400' 
      },
    };
    
    const config = statusConfig[status] || statusConfig[PaymentStatus.Unknown];
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${config.class}`}>
        {config.text}
      </span>
    );
  };
  void _getPaymentStatusBadge;

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Receipt className="h-5 w-5 text-red-400" />
            </div>
            <div className="mr-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                خطأ في تحميل البيانات
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                <p>حدث خطأ أثناء تحميل التفعيلات.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-screen">
        <WifiLoaderComponent
          background="transparent"
          desktopSize="150px"
          mobileSize="150px"
          text="تحميل التفعيلات..."
          backColor="#E8F2FC"
          frontColor="#4645F6"
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Zap className="h-8 w-8 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
            التفعيلات
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {pythonBackend
              ? 'نفس ترتيب SAS — صفحة 1 = الأحدث (page + count فقط)'
              : 'عرض وإدارة سجلات تفعيل المشتركين'}
          </p>
          {pythonBackend && (totalItems > 0 || appliedActivationMethod) && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {appliedActivationMethod && (
                <span>
                  نوع السجل: {formatActivationMethodAr(appliedActivationMethod)} ({appliedActivationMethod})
                </span>
              )}
              {totalItems > 0 && (
                <span className="block sm:inline sm:mr-2 mt-1 sm:mt-0 font-medium text-gray-700 dark:text-gray-300">
                  الإجمالي: {formatNumber(totalItems)} تفعيل — صفحة {currentPage} من {totalPages} (
                  {pageSize} لكل صفحة)
                </span>
              )}
            </p>
          )}
          {pythonBackend && sasRequestBody && Object.keys(sasRequestBody).length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono" dir="ltr">
              SAS body: {JSON.stringify(sasRequestBody)}
            </p>
          )}
        </div>
        {isAgentOrSubAgentOrEmployee && myResellers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[220px]">
              <select
                value={selectedOperationalResellerId}
                onChange={(e) => void handleResellerChange(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm min-h-[44px]"
                title="تبديل المنطقة"
              >
                {myResellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {pythonBackend && activationsHistoryHint?.note_ar && (
        <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
          <p>{activationsHistoryHint.note_ar}</p>
          {activationsHistoryHint.filter_voucher && (
            <p className="text-xs mt-1 opacity-80 font-mono" dir="ltr">
              {activationsHistoryHint.filter_voucher}
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleApplyFilters();
          }}
        >
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  name="receiptsSearch"
                  autoComplete="off"
                  placeholder={
                    pythonBackend
                      ? 'اسم المستخدم أو PIN أو المعاملة — يُصفّى على الصفحة الحالية بعد «تطبيق»'
                      : 'الاسم أو اسم المستخدم أو الهاتف أو رقم الفاتورة — Enter أو «تطبيق» (بحث من الخادم)'
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-md text-sm font-medium whitespace-nowrap"
              >
                تفريغ
              </button>
              {pythonBackend && (
                <button
                  type="button"
                  onClick={openFiltersModal}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap border transition-colors ${
                    hasActiveFilters
                      ? 'bg-primary-100 border-primary-500 text-primary-800 dark:bg-primary-900/40 dark:border-primary-500 dark:text-primary-200'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  فلترة
                  {hasActiveFilters && (
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-end">
            {!pythonBackend && (
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    من تاريخ
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    إلى تاريخ
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            )}
            <div className={`flex flex-wrap gap-2 ${pythonBackend ? 'w-full sm:justify-end' : ''}`}>
              <button
                type="submit"
                className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors"
              >
                <Search className="h-4 w-4" />
                <span>تطبيق البحث</span>
              </button>
              <button
                type="button"
                onClick={handleExportToExcel}
                disabled={isExporting || pythonBackend}
                title={pythonBackend ? 'غير متوفر في باكند Python' : undefined}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>جاري التصدير...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>تصدير Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="wakeel-table-scroll">
          <table className="min-w-full text-right">
            <thead>
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {pythonBackend ? 'PIN / المعاملة' : 'رقم الفاتورة'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  المشترك
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  المبلغ
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  تاريخ التفعيل
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  تاريخ الانتهاء
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  الباقة
                </th>
                {pythonBackend && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    طريقة التفعيل
                  </th>
                )}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {displayReceipts.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Receipt className="h-5 w-5 text-primary-600 dark:text-primary-400 ml-2" />
                      <div className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                        {receipt.activationPin || receipt.receiptNumber}
                      </div>
                      {receipt.activationTransaction && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[140px]">
                          {receipt.activationTransaction}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                        </div>
                      </div>
                      <div className="mr-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {receipt.subscriberName}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                          {receipt.subscriberUsername || '—'}
                        </div>
                        {!pythonBackend && receipt.subscriberPhone && (
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <Phone className="h-3 w-3 mr-1" />
                            {receipt.subscriberPhone}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {formatNumber(receipt.newProfileSalePrice || receipt.finalPrice || 0, { suffix: ' د.ع' })}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {receipt.renewalDays || receipt.renewalPeriod || 0} يوم
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-gray-400 ml-2" />
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatDate(receipt.renewalDate || receipt.issueDate || receipt.createdAt)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-gray-400 ml-2" />
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatDate(receipt.newExpirationDate)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {receipt.newProfileName}
                    </div>
                    {!pythonBackend && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {receipt.activationType === ActivationType.Extension
                          ? 'نوع التفعيل: تمديد'
                          : 'نوع التفعيل: اشتراك'}
                      </div>
                    )}
                  </td>
                  {pythonBackend && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderActivationMethodBadge(receipt)}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setShowReceiptModal(true);
                        }}
                        className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handlePrintReceiptPDF(receipt.id)}
                        className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                        title="طباعة الفاتورة"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {displayReceipts.length === 0 && (
          <div className="text-center py-12">
            <Receipt className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">لا توجد تفعيلات</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              لم يتم العثور على تفعيلات تطابق معايير البحث.
            </p>
            {error && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-700 dark:text-red-300">
                  خطأ في تحميل البيانات: {String(error)}
                </p>
                {error && typeof error === 'object' && 'response' in error && (error as any).response?.status === 401 && (
                  <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200">
                      ⚠️ خطأ في المصادقة: يرجى تسجيل الدخول مرة أخرى
                    </p>
                    <button
                      onClick={handleLoginRedirect}
                      className="mt-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors"
                    >
                      تسجيل الدخول
                    </button>
                  </div>
                )}
              </div>
            )}
            {!isLoading && !error && receipts && Array.isArray(receipts) && receipts.length === 0 && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  لا توجد تفعيلات في النظام بعد.
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  البيانات تم تحميلها بنجاح من الباكند، لكن لا توجد تفعيلات مسجّلة حالياً.
                </p>
                <button
                  onClick={handleRefreshData}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
                >
                  إعادة تحميل البيانات
                </button>
              </div>
            )}
            {!isLoading && !error && (!receipts || !Array.isArray(receipts)) && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  البيانات غير محملة بعد. تحقق من وحدة التحكم للمزيد من التفاصيل.
                </p>
                <button
                  onClick={handleRefreshData}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
                >
                  إعادة تحميل البيانات
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Receipt Modal */}
      {showReceiptModal && selectedReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6 no-print">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  فاتورة التفعيل
                </h2>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              
              <div ref={printRef} className="space-y-4">
                {/* Receipt Title */}
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    فاتورة التفعيل
                  </h2>
                </div>

                {/* Receipt Header */}
                <div className="text-center border-b border-gray-200 dark:border-gray-700 pb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {selectedReceipt.receiptNumber}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(selectedReceipt.renewalDate || selectedReceipt.issueDate || selectedReceipt.createdAt)} - {new Date(selectedReceipt.renewalDate || selectedReceipt.issueDate || selectedReceipt.createdAt).toLocaleTimeString(locale)}
                  </p>
                </div>

                {/* Subscriber Info */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">المشترك:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{selectedReceipt.subscriberName}</span>
                  </div>
                  {selectedReceipt.subscriberUsername && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">اسم المستخدم:</span>
                      <span className="font-medium text-gray-900 dark:text-white font-mono">
                        {selectedReceipt.subscriberUsername}
                      </span>
                    </div>
                  )}
                  {!pythonBackend && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">رقم الهاتف:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{selectedReceipt.subscriberPhone}</span>
                    </div>
                  )}
                  {pythonBackend && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">PIN:</span>
                        <span className="font-medium text-gray-900 dark:text-white font-mono">
                          {selectedReceipt.activationPin || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-gray-600 dark:text-gray-400 shrink-0">طريقة التفعيل:</span>
                        {renderActivationMethodBadge(selectedReceipt)}
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">الباقة:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{selectedReceipt.newProfileName || selectedReceipt.profileName || 'العادي'}</span>
                  </div>
                </div>

                {/* Pricing Details */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between font-bold text-lg border-t border-gray-200 dark:border-gray-600 pt-2">
                    <span className="text-gray-900 dark:text-white">سعر الاشتراك:</span>
                    <span className="text-primary-600 dark:text-primary-400">{formatNumber(selectedReceipt.newProfileSalePrice || selectedReceipt.finalPrice || 0, { suffix: ' د.ع' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">المبلغ الواصل:</span>
                    <span className="text-green-600 dark:text-green-400">{formatNumber(selectedReceipt.amountPaid || selectedReceipt.finalPrice || 0, { suffix: ' د.ع' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">مبلغ الدين:</span>
                    <span className="text-red-600 dark:text-red-400">{formatNumber(selectedReceipt.remainingAmount || 0, { suffix: ' د.ع' })}</span>
                  </div>
                </div>

                {/* Renewal Details */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">تاريخ الانتهاء الجديد:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedReceipt.newExpirationDate ? formatDate(selectedReceipt.newExpirationDate) : formatDate(new Date(new Date(selectedReceipt.renewalDate || selectedReceipt.issueDate || selectedReceipt.createdAt).getTime() + (selectedReceipt.renewalDays || selectedReceipt.renewalPeriod || 30) * 24 * 60 * 60 * 1000))}
                    </span>
                  </div>
                  {(selectedReceipt.wiFiCode || selectedReceipt.subscriberWiFiCode) && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">رمز الشبكة:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{selectedReceipt.wiFiCode || selectedReceipt.subscriberWiFiCode}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">ملاحظات الدين:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{selectedReceipt.remainingAmount > 0 ? `متبقي ${formatNumber(selectedReceipt.remainingAmount, { suffix: ' د.ع' })}` : 'لا يوجد دين'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">حالة الدفع:</span>
                    <span className={`font-medium ${
                      selectedReceipt.paymentStatus === 1 ? 'text-green-600 dark:text-green-400' :
                      selectedReceipt.paymentStatus === 2 ? 'text-red-600 dark:text-red-400' :
                      'text-yellow-600 dark:text-yellow-400'
                    }`}>
                      {selectedReceipt.paymentStatus === 1 ? 'مدفوع' :
                       selectedReceipt.paymentStatus === 2 ? 'غير مدفوع' : 'معلق'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 no-print">
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  إغلاق
                </button>
                <button
                  onClick={() => handlePrintReceiptPDF(selectedReceipt.id)}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                >
                  <Printer className="h-4 w-4" />
                  <span>طباعة</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFiltersModal && pythonBackend && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activations-filters-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 id="activations-filters-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                فلترة التفعيلات
              </h2>
              <button
                type="button"
                onClick={() => setShowFiltersModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  نوع السجل (activation_method)
                </label>
                <select
                  value={activationMethodFilter}
                  onChange={(e) => setActivationMethodFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">الكل</option>
                  {activationMethodOptions.length > 0 ? (
                    activationMethodOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label_ar || formatActivationMethodAr(opt.id)}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="voucher">كارد / قسيمة (PIN)</option>
                      <option value="user_credit">رصيد المشترك</option>
                      <option value="reward_points">نقاط مكافأة</option>
                      <option value="credit">رصيد</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  تصنيف الماستر (اختياري)
                </label>
                <select
                  value={masterTypeFilter}
                  onChange={(e) => setMasterTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">الكل</option>
                  <option value="master_agent">ماستر الوكيل</option>
                  <option value="master_subscriber">ماستر المشترك</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                نوع السجل وتصنيف الماستر يُرسلان للباكند. الترقيم مثل SAS (page + count). البحث محلي على
                الصفحة الحالية.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setActivationMethodFilter('');
                  setMasterTypeFilter('');
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                مسح حقول المودال
              </button>
              <button
                type="button"
                onClick={() => handleApplyFilters(true)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white"
              >
                تطبيق الفلاتر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowDropdown(null)}
        />
      )}

      {/* Pagination */}
      {(totalPages > 1 || (pythonBackend && totalItems > 0)) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">عدد العناصر:</label>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 dark:text-white"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                عرض {((currentPage - 1) * pageSize) + 1} إلى {Math.min(currentPage * pageSize, totalItems)} من {totalItems} تفعيل
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-white"
              >
                السابق
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                if (page > totalPages) return null;
                
                return (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 text-sm border rounded-md ${
                      page === currentPage
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-700 dark:text-white'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-white"
              >
                التالي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptsPage;