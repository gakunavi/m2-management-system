import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log('Seeding database...');

  // 既存データをクリア + シーケンスリセット
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      inquiry_attachments,
      inquiries,
      qa_attachments,
      qa_items,
      qa_categories,
      project_files,
      project_comments,
      project_reminders,
      project_movements,
      projects,
      movement_templates,
      business_status_definitions,
      sales_targets,
      business_documents,
      notifications,
      announcements,
      customer_contact_business_links,
      customer_contacts,
      customer_business_links,
      customer_bank_accounts,
      customers,
      partner_contact_business_links,
      partner_contacts,
      partner_bank_accounts,
      partner_business_links,
      partners,
      saved_table_views,
      user_table_preferences,
      user_business_assignments,
      users,
      businesses,
      industries
    RESTART IDENTITY CASCADE
  `);

  await prisma.$transaction(async (tx) => {
    // ============================================
    // 0. 業種マスタ
    // ============================================
    const industryIT = await tx.industry.create({ data: { industryName: 'IT・ソフトウェア', displayOrder: 1 } });
    const industryConsulting = await tx.industry.create({ data: { industryName: 'コンサルティング', displayOrder: 2 } });
    const industryManufacturing = await tx.industry.create({ data: { industryName: '製造業', displayOrder: 3 } });
    const industryConstruction = await tx.industry.create({ data: { industryName: '建設・不動産', displayOrder: 4 } });
    const industryRetail = await tx.industry.create({ data: { industryName: '小売・卸売', displayOrder: 5 } });
    await tx.industry.createMany({
      data: [
        { industryName: '金融・保険', displayOrder: 6 },
        { industryName: '医療・福祉', displayOrder: 7 },
        { industryName: '教育・研究', displayOrder: 8 },
        { industryName: '運輸・物流', displayOrder: 9 },
        { industryName: 'その他', displayOrder: 99 },
      ],
    });

    // ============================================
    // 1. 事業マスタ（充実した businessConfig）
    // ============================================
    const businessA = await tx.business.create({
      data: {
        businessCode: 'moag',
        businessName: 'MOAG事業',
        businessDescription: 'MOAG（省エネ機器）の営業管理',
        businessConfig: {
          projectFields: [
            {
              key: 'needs',
              label: 'ニーズ',
              type: 'select',
              required: false,
              options: ['省エネ', 'コスト削減', '環境対応', 'リプレイス', 'その他'],
              sortOrder: 1,
              visibleToPartner: true,
              filterable: true,
            },
            {
              key: 'proposed_amount',
              label: '提案金額',
              type: 'number',
              required: false,
              description: '提案金額（税抜）',
              sortOrder: 2,
              visibleToPartner: true,
              filterable: false,
            },
            {
              key: 'installation_site',
              label: '設置場所',
              type: 'text',
              required: false,
              description: '機器の設置場所・施設名',
              sortOrder: 3,
              visibleToPartner: true,
              filterable: false,
            },
            {
              key: 'unit_count',
              label: '台数',
              type: 'number',
              required: false,
              sortOrder: 4,
              visibleToPartner: true,
              filterable: false,
            },
            {
              key: 'unit_price',
              label: '単価',
              type: 'number',
              required: false,
              sortOrder: 5,
              visibleToPartner: false,
              filterable: false,
            },
            {
              key: 'total_amount',
              label: '合計金額',
              type: 'formula',
              required: false,
              formula: 'unit_count * unit_price',
              sortOrder: 6,
              visibleToPartner: false,
              filterable: false,
            },
            {
              key: 'subsidy_applicable',
              label: '補助金対象',
              type: 'checkbox',
              required: false,
              sortOrder: 7,
              visibleToPartner: true,
              filterable: true,
            },
            {
              key: 'delivery_date',
              label: '納品予定日',
              type: 'date',
              required: false,
              sortOrder: 8,
              visibleToPartner: true,
              filterable: false,
            },
            {
              key: 'remarks',
              label: '備考',
              type: 'textarea',
              required: false,
              sortOrder: 9,
              visibleToPartner: false,
              filterable: false,
            },
          ],
          fileCategories: [
            { key: 'location_list', label: '設置場所一覧', sortOrder: 1 },
            { key: 'checklist', label: 'チェックリスト', sortOrder: 2 },
            { key: 'industrial_certificate', label: '工業会認定証', sortOrder: 3 },
            { key: 'sme_application', label: '中企庁申請書', sortOrder: 4 },
            { key: 'sme_certificate', label: '中企庁認定証', sortOrder: 5 },
            { key: 'invoice', label: '請求書', sortOrder: 6 },
            { key: 'receipt', label: '領収書', sortOrder: 7 },
            { key: 'delivery_slip', label: '納品書', sortOrder: 8 },
            { key: 'installation_report', label: '設置報告書', sortOrder: 9 },
          ],
          kpiDefinitions: [
            {
              key: 'revenue',
              label: '売上金額',
              sourceField: 'proposed_amount',
              unit: '#円',
            },
            {
              key: 'units',
              label: '導入台数',
              sourceField: 'unit_count',
              unit: '#台',
            },
          ],
        } as unknown as Prisma.InputJsonValue,
        businessSortOrder: 1,
      },
    });

    const businessB = await tx.business.create({
      data: {
        businessCode: 'service_a',
        businessName: 'サービスA事業',
        businessDescription: 'サービスAの営業管理',
        businessConfig: {
          projectFields: [
            {
              key: 'plan_type',
              label: 'プラン',
              type: 'select',
              required: false,
              options: ['スタンダード', 'プレミアム', 'エンタープライズ'],
              sortOrder: 1,
              visibleToPartner: true,
              filterable: true,
            },
            {
              key: 'monthly_fee',
              label: '月額利用料',
              type: 'number',
              required: false,
              sortOrder: 2,
              visibleToPartner: true,
              filterable: false,
            },
            {
              key: 'contract_months',
              label: '契約期間（月）',
              type: 'number',
              required: false,
              sortOrder: 3,
              visibleToPartner: true,
              filterable: false,
            },
            {
              key: 'total_contract_value',
              label: '契約総額',
              type: 'formula',
              required: false,
              formula: 'monthly_fee * contract_months',
              sortOrder: 4,
              visibleToPartner: false,
              filterable: false,
            },
            {
              key: 'start_month',
              label: '利用開始月',
              type: 'month',
              required: false,
              sortOrder: 5,
              visibleToPartner: true,
              filterable: false,
            },
          ],
          fileCategories: [
            { key: 'contract', label: '契約書', sortOrder: 1 },
            { key: 'proposal', label: '提案書', sortOrder: 2 },
            { key: 'specification', label: '仕様書', sortOrder: 3 },
          ],
          kpiDefinitions: [
            {
              key: 'revenue',
              label: '契約総額',
              sourceField: 'total_contract_value',
              unit: '¥#',
            },
          ],
        } as unknown as Prisma.InputJsonValue,
        businessSortOrder: 2,
      },
    });

    // ============================================
    // 2. ユーザー
    // ============================================
    const [adminHash, staffHash, staff2Hash, partnerHash] = await Promise.all([
      bcrypt.hash('admin123', SALT_ROUNDS),
      bcrypt.hash('staff123', SALT_ROUNDS),
      bcrypt.hash('staff456', SALT_ROUNDS),
      bcrypt.hash('partner123', SALT_ROUNDS),
    ]);

    const admin = await tx.user.create({
      data: {
        userEmail: 'admin@example.com',
        userPasswordHash: adminHash,
        userPasswordPlain: 'admin123',
        userName: '管理者 太郎',
        userRole: 'admin',
      },
    });

    const staff1 = await tx.user.create({
      data: {
        userEmail: 'staff@example.com',
        userPasswordHash: staffHash,
        userPasswordPlain: 'staff123',
        userName: '山田 花子',
        userRole: 'staff',
        createdBy: admin.id,
      },
    });

    const staff2 = await tx.user.create({
      data: {
        userEmail: 'staff2@example.com',
        userPasswordHash: staff2Hash,
        userPasswordPlain: 'staff456',
        userName: '佐々木 一郎',
        userRole: 'staff',
        createdBy: admin.id,
      },
    });

    const partnerAdminUser = await tx.user.create({
      data: {
        userEmail: 'partner-admin@example.com',
        userPasswordHash: partnerHash,
        userPasswordPlain: 'partner123',
        userName: '佐藤 代理店長',
        userRole: 'partner_admin',
        createdBy: admin.id,
      },
    });

    const partnerStaffUser = await tx.user.create({
      data: {
        userEmail: 'partner-staff@example.com',
        userPasswordHash: partnerHash,
        userPasswordPlain: 'partner123',
        userName: '中村 美咲',
        userRole: 'partner_staff',
        createdBy: admin.id,
      },
    });

    const partnerAdmin2User = await tx.user.create({
      data: {
        userEmail: 'partner-admin2@example.com',
        userPasswordHash: partnerHash,
        userPasswordPlain: 'partner123',
        userName: '木村 浩二',
        userRole: 'partner_admin',
        createdBy: admin.id,
      },
    });

    // ============================================
    // 3. 事業割り当て
    // ============================================
    await tx.userBusinessAssignment.createMany({
      data: [
        { userId: admin.id, businessId: businessA.id, assignmentRole: 'admin' },
        { userId: admin.id, businessId: businessB.id, assignmentRole: 'admin' },
        { userId: staff1.id, businessId: businessA.id, assignmentRole: 'member' },
        { userId: staff1.id, businessId: businessB.id, assignmentRole: 'member' },
        { userId: staff2.id, businessId: businessA.id, assignmentRole: 'member' },
      ],
    });

    // ============================================
    // 4. 顧客マスタ（5社）
    // ============================================
    const customer1 = await tx.customer.create({
      data: {
        customerCode: 'CST-0001',
        customerName: '株式会社テクノサービス',
        customerSalutation: '株式会社テクノサービス 御中',
        customerType: '法人',
        customerPostalCode: '100-0001',
        customerAddress: '東京都千代田区千代田1-1-1',
        customerPhone: '03-1234-5678',
        customerFax: '03-1234-5679',
        customerEmail: 'info@techno-service.example.com',
        customerWebsite: 'https://techno-service.example.com',
        industryId: industryIT.id,
        customerCorporateNumber: '1234567890123',
        customerInvoiceNumber: 'T1234567890123',
        customerCapital: BigInt(50_000_000),
        customerEstablishedDate: new Date('2005-04-01'),
        customerFiscalMonth: 3,
        customerNotes: '大口顧客。複数事業に跨って取引あり。',
        createdBy: admin.id,
      },
    });

    const customer2 = await tx.customer.create({
      data: {
        customerCode: 'CST-0002',
        customerName: '個人事業主 田中 太郎',
        customerSalutation: '田中 太郎 様',
        customerType: '個人事業主',
        customerPostalCode: '530-0001',
        customerAddress: '大阪府大阪市北区梅田1-2-3',
        customerPhone: '06-9876-5432',
        customerEmail: 'tanaka@example.com',
        industryId: industryConsulting.id,
        customerFiscalMonth: 12,
        customerNotes: 'コンサルティング業の個人事業主。',
        createdBy: admin.id,
      },
    });

    const customer3 = await tx.customer.create({
      data: {
        customerCode: 'CST-0003',
        customerName: '合同会社グリーンファクトリー',
        customerSalutation: '合同会社グリーンファクトリー 御中',
        customerType: '法人',
        customerPostalCode: '460-0001',
        customerAddress: '愛知県名古屋市中区栄1-1-1',
        customerPhone: '052-111-2222',
        industryId: industryManufacturing.id,
        customerCapital: BigInt(10_000_000),
        customerFiscalMonth: 9,
        createdBy: staff1.id,
      },
    });

    const customer4 = await tx.customer.create({
      data: {
        customerCode: 'CST-0004',
        customerName: '株式会社ビルドアップ',
        customerSalutation: '株式会社ビルドアップ 御中',
        customerType: '法人',
        customerPostalCode: '812-0011',
        customerAddress: '福岡県福岡市博多区博多駅前3-1-1',
        customerPhone: '092-333-4444',
        customerEmail: 'info@buildup.example.com',
        industryId: industryConstruction.id,
        customerCapital: BigInt(30_000_000),
        customerEstablishedDate: new Date('2010-08-15'),
        customerFiscalMonth: 3,
        createdBy: admin.id,
      },
    });

    const customer5 = await tx.customer.create({
      data: {
        customerCode: 'CST-0005',
        customerName: '有限会社ライフマート',
        customerSalutation: '有限会社ライフマート 御中',
        customerType: '法人',
        customerPostalCode: '980-0021',
        customerAddress: '宮城県仙台市青葉区中央1-1-1',
        customerPhone: '022-555-6666',
        industryId: industryRetail.id,
        createdBy: staff2.id,
      },
    });

    // 5. 顧客-事業リンク
    await tx.customerBusinessLink.createMany({
      data: [
        { customerId: customer1.id, businessId: businessA.id, linkStatus: 'active' },
        { customerId: customer1.id, businessId: businessB.id, linkStatus: 'active' },
        { customerId: customer2.id, businessId: businessA.id, linkStatus: 'active' },
        { customerId: customer3.id, businessId: businessA.id, linkStatus: 'active' },
        { customerId: customer3.id, businessId: businessB.id, linkStatus: 'active' },
        { customerId: customer4.id, businessId: businessA.id, linkStatus: 'active' },
        { customerId: customer5.id, businessId: businessA.id, linkStatus: 'active' },
        { customerId: customer5.id, businessId: businessB.id, linkStatus: 'active' },
      ],
    });

    // 6. 顧客担当者
    const cc1 = await tx.customerContact.create({
      data: { customerId: customer1.id, contactName: '高橋 健一', contactDepartment: '総務部', contactPosition: '部長', contactIsRepresentative: true, contactPhone: '03-1234-5678', contactEmail: 'takahashi@techno-service.example.com', contactIsPrimary: true, contactSortOrder: 0 },
    });
    const cc2 = await tx.customerContact.create({
      data: { customerId: customer1.id, contactName: '鈴木 次郎', contactDepartment: '経営企画部', contactPosition: '課長', contactIsRepresentative: false, contactPhone: '03-1234-5680', contactEmail: 'suzuki@techno-service.example.com', contactIsPrimary: false, contactSortOrder: 1 },
    });
    const cc3 = await tx.customerContact.create({
      data: { customerId: customer2.id, contactName: '田中 太郎', contactIsRepresentative: true, contactPhone: '06-9876-5432', contactEmail: 'tanaka@example.com', contactIsPrimary: true, contactSortOrder: 0 },
    });
    const cc4 = await tx.customerContact.create({
      data: { customerId: customer3.id, contactName: '伊藤 三郎', contactDepartment: '工場管理部', contactPosition: '部長', contactIsRepresentative: true, contactPhone: '052-111-2222', contactIsPrimary: true, contactSortOrder: 0 },
    });
    const cc5 = await tx.customerContact.create({
      data: { customerId: customer4.id, contactName: '渡辺 明', contactDepartment: '管理部', contactPosition: '課長', contactIsRepresentative: true, contactPhone: '092-333-4444', contactEmail: 'watanabe@buildup.example.com', contactIsPrimary: true, contactSortOrder: 0 },
    });

    // 7. 担当者-事業リンク
    await tx.customerContactBusinessLink.createMany({
      data: [
        { contactId: cc1.id, businessId: businessA.id },
        { contactId: cc1.id, businessId: businessB.id },
        { contactId: cc2.id, businessId: businessA.id },
        { contactId: cc3.id, businessId: businessA.id },
        { contactId: cc4.id, businessId: businessA.id },
        { contactId: cc4.id, businessId: businessB.id },
        { contactId: cc5.id, businessId: businessA.id },
      ],
    });

    // ============================================
    // 8. 代理店マスタ（4社、階層構造）
    // ============================================
    const partner1 = await tx.partner.create({
      data: {
        partnerCode: 'AG-0001',
        partnerName: '株式会社エースパートナー',
        partnerSalutation: 'エースパートナー',
        partnerTier: '1次代理店',
        partnerTierNumber: '1',
        parentId: null,
        partnerType: '法人',
        partnerPostalCode: '150-0001',
        partnerAddress: '東京都渋谷区神宮前1-1-1',
        partnerPhone: '03-5555-1111',
        partnerFax: '03-5555-1112',
        partnerEmail: 'info@ace-partner.example.com',
        partnerWebsite: 'https://ace-partner.example.com',
        industryId: industryIT.id,
        partnerEstablishedDate: new Date('2015-06-01'),
        partnerCapital: BigInt(20_000_000),
        partnerNotes: '主要1次代理店。MOAG・サービスA両方対応。',
        createdBy: admin.id,
      },
    });

    // パートナーユーザーを代理店に紐づけ
    await tx.user.update({ where: { id: partnerAdminUser.id }, data: { userPartnerId: partner1.id } });
    await tx.user.update({ where: { id: partnerStaffUser.id }, data: { userPartnerId: partner1.id } });

    const partner2 = await tx.partner.create({
      data: {
        partnerCode: 'AG-0002',
        partnerName: '合同会社ビジョンプロ',
        partnerSalutation: 'ビジョンプロ',
        partnerTier: '2次代理店',
        partnerTierNumber: '1-1',
        parentId: partner1.id,
        partnerType: '法人',
        partnerPostalCode: '530-0011',
        partnerAddress: '大阪府大阪市北区大深町1-1',
        partnerPhone: '06-6666-2222',
        partnerEmail: 'contact@visionpro.example.com',
        industryId: industryConsulting.id,
        partnerEstablishedDate: new Date('2018-10-15'),
        createdBy: admin.id,
      },
    });
    await tx.user.update({ where: { id: partnerAdmin2User.id }, data: { userPartnerId: partner2.id } });

    const partner3 = await tx.partner.create({
      data: {
        partnerCode: 'AG-0003',
        partnerName: '田村 健一（個人代理店）',
        partnerSalutation: '田村さん',
        partnerTier: '2次代理店',
        partnerTierNumber: '1-2',
        parentId: partner1.id,
        partnerType: '個人事業主',
        partnerPostalCode: '460-0008',
        partnerAddress: '愛知県名古屋市中区栄3-1-1',
        partnerPhone: '052-222-3333',
        partnerEmail: 'tamura@example.com',
        createdBy: staff1.id,
      },
    });

    const partner4 = await tx.partner.create({
      data: {
        partnerCode: 'AG-0004',
        partnerName: '株式会社サンライズ商事',
        partnerSalutation: 'サンライズ商事',
        partnerTier: '1次代理店',
        partnerTierNumber: '2',
        parentId: null,
        partnerType: '法人',
        partnerPostalCode: '812-0012',
        partnerAddress: '福岡県福岡市博多区博多駅中央街5-1',
        partnerPhone: '092-777-8888',
        partnerEmail: 'info@sunrise.example.com',
        industryId: industryRetail.id,
        createdBy: admin.id,
      },
    });

    // ============================================
    // 9. 事業別代理店階層（PartnerBusinessLink）
    // ============================================
    await tx.partnerBusinessLink.createMany({
      data: [
        // MOAG事業
        { partnerId: partner1.id, businessId: businessA.id, linkStatus: 'active', businessTier: '1次代理店', businessTierNumber: '1', businessParentId: null, commissionRate: new Prisma.Decimal(15) },
        { partnerId: partner2.id, businessId: businessA.id, linkStatus: 'active', businessTier: '2次代理店', businessTierNumber: '1-1', businessParentId: partner1.id, commissionRate: new Prisma.Decimal(10) },
        { partnerId: partner3.id, businessId: businessA.id, linkStatus: 'active', businessTier: '2次代理店', businessTierNumber: '1-2', businessParentId: partner1.id, commissionRate: new Prisma.Decimal(8) },
        { partnerId: partner4.id, businessId: businessA.id, linkStatus: 'active', businessTier: '1次代理店', businessTierNumber: '2', businessParentId: null, commissionRate: new Prisma.Decimal(12) },
        // サービスA事業
        { partnerId: partner1.id, businessId: businessB.id, linkStatus: 'active', businessTier: '1次代理店', businessTierNumber: '1', businessParentId: null, commissionRate: new Prisma.Decimal(20) },
        { partnerId: partner2.id, businessId: businessB.id, linkStatus: 'active', businessTier: '2次代理店', businessTierNumber: '1-1', businessParentId: partner1.id, commissionRate: new Prisma.Decimal(12) },
      ],
    });

    // 10. 代理店担当者
    const pc1 = await tx.partnerContact.create({
      data: { partnerId: partner1.id, contactName: '佐藤 一郎', contactDepartment: '営業部', contactPosition: '代表取締役', contactIsRepresentative: true, contactPhone: '03-5555-1111', contactEmail: 'sato@ace-partner.example.com', contactIsPrimary: false, contactSortOrder: 0 },
    });
    const pc2 = await tx.partnerContact.create({
      data: { partnerId: partner1.id, contactName: '中村 美咲', contactDepartment: '営業部', contactPosition: '営業マネージャー', contactIsRepresentative: false, contactPhone: '03-5555-1113', contactEmail: 'nakamura@ace-partner.example.com', contactIsPrimary: true, contactSortOrder: 1 },
    });
    const pc3 = await tx.partnerContact.create({
      data: { partnerId: partner2.id, contactName: '木村 浩二', contactPosition: '代表社員', contactIsRepresentative: true, contactPhone: '06-6666-2222', contactEmail: 'kimura@visionpro.example.com', contactIsPrimary: true, contactSortOrder: 0 },
    });
    const pc4 = await tx.partnerContact.create({
      data: { partnerId: partner3.id, contactName: '田村 健一', contactIsRepresentative: true, contactPhone: '052-222-3333', contactEmail: 'tamura@example.com', contactIsPrimary: true, contactSortOrder: 0 },
    });
    const pc5 = await tx.partnerContact.create({
      data: { partnerId: partner4.id, contactName: '松本 大輔', contactDepartment: '営業課', contactPosition: '課長', contactIsRepresentative: true, contactPhone: '092-777-8888', contactEmail: 'matsumoto@sunrise.example.com', contactIsPrimary: true, contactSortOrder: 0 },
    });

    // 11. 代理店担当者-事業リンク
    await tx.partnerContactBusinessLink.createMany({
      data: [
        { contactId: pc1.id, businessId: businessA.id },
        { contactId: pc1.id, businessId: businessB.id },
        { contactId: pc2.id, businessId: businessA.id },
        { contactId: pc2.id, businessId: businessB.id },
        { contactId: pc3.id, businessId: businessA.id },
        { contactId: pc3.id, businessId: businessB.id },
        { contactId: pc4.id, businessId: businessA.id },
        { contactId: pc5.id, businessId: businessA.id },
      ],
    });

    // 12. 代理店口座情報
    await tx.partnerBankAccount.create({
      data: { partnerId: partner1.id, businessId: null, bankName: '三菱UFJ銀行', branchName: '渋谷支店', accountType: '普通', accountNumber: '1234567', accountHolder: 'カブシキガイシャエースパートナー' },
    });
    await tx.partnerBankAccount.create({
      data: { partnerId: partner1.id, businessId: businessA.id, bankName: 'みずほ銀行', branchName: '新宿支店', accountType: '当座', accountNumber: '7654321', accountHolder: 'カブシキガイシャエースパートナー' },
    });
    await tx.partnerBankAccount.create({
      data: { partnerId: partner2.id, businessId: null, bankName: '大阪信用金庫', branchName: '梅田支店', accountType: '普通', accountNumber: '9876543', accountHolder: 'ゴウドウガイシャビジョンプロ' },
    });
    await tx.partnerBankAccount.create({
      data: { partnerId: partner4.id, businessId: null, bankName: '福岡銀行', branchName: '博多支店', accountType: '普通', accountNumber: '1112233', accountHolder: 'カブシキガイシャサンライズショウジ' },
    });

    // ============================================
    // 13. 営業ステータス定義（MOAG事業）
    // ============================================
    await tx.businessStatusDefinition.create({
      data: { businessId: businessA.id, statusCode: 'yomi', statusLabel: '予見', statusPriority: 10, statusColor: '#94a3b8', statusIsFinal: false, statusIsLost: false, statusSortOrder: 1, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessA.id, statusCode: 'quote', statusLabel: '見積提出', statusPriority: 30, statusColor: '#3b82f6', statusIsFinal: false, statusIsLost: false, statusSortOrder: 2, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessA.id, statusCode: 'nego', statusLabel: '交渉中', statusPriority: 50, statusColor: '#f59e0b', statusIsFinal: false, statusIsLost: false, statusSortOrder: 3, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessA.id, statusCode: 'won', statusLabel: '受注', statusPriority: 90, statusColor: '#22c55e', statusIsFinal: true, statusIsLost: false, statusSortOrder: 4, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessA.id, statusCode: 'lost', statusLabel: '失注', statusPriority: 10, statusColor: '#ef4444', statusIsFinal: true, statusIsLost: true, statusSortOrder: 5, statusIsActive: true },
    });

    // 14. 営業ステータス定義（サービスA事業）
    await tx.businessStatusDefinition.create({
      data: { businessId: businessB.id, statusCode: 'lead', statusLabel: 'リード', statusPriority: 10, statusColor: '#94a3b8', statusIsFinal: false, statusIsLost: false, statusSortOrder: 1, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessB.id, statusCode: 'proposal', statusLabel: '提案中', statusPriority: 40, statusColor: '#8b5cf6', statusIsFinal: false, statusIsLost: false, statusSortOrder: 2, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessB.id, statusCode: 'trial', statusLabel: 'トライアル', statusPriority: 60, statusColor: '#f59e0b', statusIsFinal: false, statusIsLost: false, statusSortOrder: 3, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessB.id, statusCode: 'contract', statusLabel: '契約済', statusPriority: 90, statusColor: '#22c55e', statusIsFinal: true, statusIsLost: false, statusSortOrder: 4, statusIsActive: true },
    });
    await tx.businessStatusDefinition.create({
      data: { businessId: businessB.id, statusCode: 'lost', statusLabel: '失注', statusPriority: 10, statusColor: '#ef4444', statusIsFinal: true, statusIsLost: true, statusSortOrder: 5, statusIsActive: true },
    });

    // ============================================
    // 15. ムーブメント定義（MOAG事業）— stepLinkedFieldKey 付き
    // ============================================
    const tmpl1 = await tx.movementTemplate.create({
      data: { businessId: businessA.id, stepNumber: 1, stepCode: 'initial_visit', stepName: '初回訪問', stepDescription: '顧客への初回訪問・ヒアリング', stepLinkedFieldKey: 'needs', visibleToPartner: true },
    });
    const tmpl2 = await tx.movementTemplate.create({
      data: { businessId: businessA.id, stepNumber: 2, stepCode: 'site_survey', stepName: '現地調査', stepDescription: '設置場所の現地調査・計測', stepLinkedFieldKey: 'installation_site', visibleToPartner: true },
    });
    const tmpl3 = await tx.movementTemplate.create({
      data: { businessId: businessA.id, stepNumber: 3, stepCode: 'quote_submission', stepName: '見積提出', stepDescription: '見積書の作成・提出', stepLinkedFieldKey: 'proposed_amount', visibleToPartner: true },
    });
    const tmpl4 = await tx.movementTemplate.create({
      data: { businessId: businessA.id, stepNumber: 4, stepCode: 'negotiation', stepName: '交渉・調整', stepDescription: '価格交渉・仕様調整', stepLinkedFieldKey: null, visibleToPartner: true },
    });
    const tmpl5 = await tx.movementTemplate.create({
      data: { businessId: businessA.id, stepNumber: 5, stepCode: 'order_receipt', stepName: '受注確定', stepDescription: '発注書受領・受注確定', stepLinkedFieldKey: 'delivery_date', visibleToPartner: false },
    });

    // ムーブメント定義（サービスA事業）
    const tmplB1 = await tx.movementTemplate.create({
      data: { businessId: businessB.id, stepNumber: 1, stepCode: 'hearing', stepName: 'ヒアリング', stepDescription: '要件ヒアリング', stepLinkedFieldKey: 'plan_type', visibleToPartner: true },
    });
    const tmplB2 = await tx.movementTemplate.create({
      data: { businessId: businessB.id, stepNumber: 2, stepCode: 'demo', stepName: 'デモ実施', stepDescription: 'サービスデモンストレーション', stepLinkedFieldKey: null, visibleToPartner: true },
    });
    const tmplB3 = await tx.movementTemplate.create({
      data: { businessId: businessB.id, stepNumber: 3, stepCode: 'proposal', stepName: '提案・見積', stepDescription: '正式提案書と見積書の提出', stepLinkedFieldKey: 'monthly_fee', visibleToPartner: true },
    });
    const tmplB4 = await tx.movementTemplate.create({
      data: { businessId: businessB.id, stepNumber: 4, stepCode: 'closing', stepName: '契約締結', stepDescription: '契約書締結・開始日調整', stepLinkedFieldKey: 'start_month', visibleToPartner: false },
    });

    // ============================================
    // 16. 案件データ（MOAG事業: 8件）
    // ============================================
    const proj1 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer1.id, partnerId: partner1.id,
        projectNo: 'MG-0001', projectSalesStatus: 'quote',
        projectStatusChangedAt: new Date('2026-01-15'), projectExpectedCloseMonth: '2026-03',
        projectAssignedUserId: staff1.id, projectAssignedUserName: '山田 花子',
        projectNotes: '本社ロビーへの省エネ機器導入。3月受注目標。',
        projectCustomData: { needs: '省エネ', proposed_amount: 1500000, installation_site: '本社1Fロビー', unit_count: 3, unit_price: 500000, subsidy_applicable: true, remarks: '補助金申請予定' } as unknown as Prisma.InputJsonValue,
        createdBy: admin.id, updatedBy: staff1.id,
      },
    });

    const proj2 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer2.id, partnerId: null,
        projectNo: 'MG-0002', projectSalesStatus: 'yomi',
        projectStatusChangedAt: new Date('2026-02-01'), projectExpectedCloseMonth: '2026-06',
        projectAssignedUserId: staff1.id, projectAssignedUserName: '山田 花子',
        projectCustomData: { needs: 'コスト削減', proposed_amount: 800000, installation_site: '事務所', unit_count: 2, unit_price: 400000, subsidy_applicable: false } as unknown as Prisma.InputJsonValue,
        createdBy: admin.id, updatedBy: admin.id,
      },
    });

    const proj3 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer3.id, partnerId: partner2.id,
        projectNo: 'MG-0003', projectSalesStatus: 'nego',
        projectStatusChangedAt: new Date('2026-01-20'), projectExpectedCloseMonth: '2026-04',
        projectAssignedUserId: admin.id, projectAssignedUserName: '管理者 太郎',
        projectNotes: '工場への大型導入。補助金対象確認中。',
        projectCustomData: { needs: '環境対応', proposed_amount: 5000000, installation_site: '第一工場', unit_count: 10, unit_price: 500000, subsidy_applicable: true, delivery_date: '2026-05-15' } as unknown as Prisma.InputJsonValue,
        createdBy: admin.id, updatedBy: admin.id,
      },
    });

    const proj4 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer4.id, partnerId: partner4.id,
        projectNo: 'MG-0004', projectSalesStatus: 'yomi',
        projectStatusChangedAt: new Date('2026-02-15'), projectExpectedCloseMonth: '2026-07',
        projectAssignedUserId: staff2.id, projectAssignedUserName: '佐々木 一郎',
        projectCustomData: { needs: 'リプレイス', proposed_amount: 2000000, installation_site: '本社ビル', unit_count: 4, unit_price: 500000, subsidy_applicable: false } as unknown as Prisma.InputJsonValue,
        createdBy: staff2.id, updatedBy: staff2.id,
      },
    });

    const proj5 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer5.id, partnerId: partner1.id,
        projectNo: 'MG-0005', projectSalesStatus: 'quote',
        projectStatusChangedAt: new Date('2026-02-20'), projectExpectedCloseMonth: '2026-05',
        projectAssignedUserId: staff1.id, projectAssignedUserName: '山田 花子',
        projectCustomData: { needs: '省エネ', proposed_amount: 1200000, installation_site: '店舗', unit_count: 2, unit_price: 600000, subsidy_applicable: true } as unknown as Prisma.InputJsonValue,
        createdBy: admin.id, updatedBy: staff1.id,
      },
    });

    const proj6 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer1.id, partnerId: partner3.id,
        projectNo: 'MG-0006', projectSalesStatus: 'won',
        projectStatusChangedAt: new Date('2026-01-30'), projectExpectedCloseMonth: '2026-02',
        projectAssignedUserId: admin.id, projectAssignedUserName: '管理者 太郎',
        projectNotes: '受注済み。納品待ち。',
        projectCustomData: { needs: 'コスト削減', proposed_amount: 3000000, installation_site: '倉庫', unit_count: 6, unit_price: 500000, subsidy_applicable: false, delivery_date: '2026-03-10' } as unknown as Prisma.InputJsonValue,
        projectRenovationNumber: 'R-001',
        createdBy: admin.id, updatedBy: admin.id,
      },
    });

    const proj7 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer3.id, partnerId: partner2.id,
        projectNo: 'MG-0007', projectSalesStatus: 'lost',
        projectStatusChangedAt: new Date('2026-01-10'), projectExpectedCloseMonth: '2026-02',
        projectAssignedUserId: staff2.id, projectAssignedUserName: '佐々木 一郎',
        projectNotes: '競合に負け。価格面が敗因。',
        projectCustomData: { needs: 'その他', proposed_amount: 900000, installation_site: '第二工場', unit_count: 1, unit_price: 900000, subsidy_applicable: false } as unknown as Prisma.InputJsonValue,
        createdBy: staff2.id, updatedBy: staff2.id,
      },
    });

    const proj8 = await tx.project.create({
      data: {
        businessId: businessA.id, customerId: customer4.id, partnerId: partner1.id,
        projectNo: 'MG-0008', projectSalesStatus: 'nego',
        projectStatusChangedAt: new Date('2026-03-01'), projectExpectedCloseMonth: '2026-05',
        projectAssignedUserId: staff1.id, projectAssignedUserName: '山田 花子',
        projectCustomData: { needs: '環境対応', proposed_amount: 4500000, installation_site: '新築ビル地下1F', unit_count: 9, unit_price: 500000, subsidy_applicable: true, delivery_date: '2026-06-01' } as unknown as Prisma.InputJsonValue,
        createdBy: staff1.id, updatedBy: staff1.id,
      },
    });

    // 17. 案件データ（サービスA事業: 4件）
    const projB1 = await tx.project.create({
      data: {
        businessId: businessB.id, customerId: customer1.id, partnerId: partner1.id,
        projectNo: 'SA-0001', projectSalesStatus: 'proposal',
        projectStatusChangedAt: new Date('2026-02-10'), projectExpectedCloseMonth: '2026-05',
        projectAssignedUserId: admin.id, projectAssignedUserName: '管理者 太郎',
        projectCustomData: { plan_type: 'プレミアム', monthly_fee: 50000, contract_months: 12, start_month: '2026-06' } as unknown as Prisma.InputJsonValue,
        createdBy: admin.id, updatedBy: admin.id,
      },
    });

    const projB2 = await tx.project.create({
      data: {
        businessId: businessB.id, customerId: customer3.id, partnerId: partner2.id,
        projectNo: 'SA-0002', projectSalesStatus: 'trial',
        projectStatusChangedAt: new Date('2026-02-25'), projectExpectedCloseMonth: '2026-04',
        projectAssignedUserId: staff1.id, projectAssignedUserName: '山田 花子',
        projectCustomData: { plan_type: 'エンタープライズ', monthly_fee: 100000, contract_months: 24, start_month: '2026-05' } as unknown as Prisma.InputJsonValue,
        createdBy: staff1.id, updatedBy: staff1.id,
      },
    });

    const projB3 = await tx.project.create({
      data: {
        businessId: businessB.id, customerId: customer5.id, partnerId: null,
        projectNo: 'SA-0003', projectSalesStatus: 'lead',
        projectStatusChangedAt: new Date('2026-03-05'), projectExpectedCloseMonth: '2026-08',
        projectAssignedUserId: admin.id, projectAssignedUserName: '管理者 太郎',
        projectCustomData: { plan_type: 'スタンダード', monthly_fee: 30000, contract_months: 6 } as unknown as Prisma.InputJsonValue,
        createdBy: admin.id, updatedBy: admin.id,
      },
    });

    const projB4 = await tx.project.create({
      data: {
        businessId: businessB.id, customerId: customer1.id, partnerId: partner1.id,
        projectNo: 'SA-0004', projectSalesStatus: 'contract',
        projectStatusChangedAt: new Date('2026-01-20'), projectExpectedCloseMonth: '2026-02',
        projectAssignedUserId: admin.id, projectAssignedUserName: '管理者 太郎',
        projectCustomData: { plan_type: 'スタンダード', monthly_fee: 30000, contract_months: 12, start_month: '2026-02' } as unknown as Prisma.InputJsonValue,
        createdBy: admin.id, updatedBy: admin.id,
      },
    });

    // ============================================
    // 18. ムーブメントデータ（MOAG案件）
    // ============================================
    // proj1: 見積提出まで完了
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj1.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-10'), movementNotes: '省エネニーズをヒアリング' },
        { projectId: proj1.id, templateId: tmpl2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-13'), movementNotes: '設置スペース確認済み' },
        { projectId: proj1.id, templateId: tmpl3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-15') },
        { projectId: proj1.id, templateId: tmpl4.id, movementStatus: 'pending' },
        { projectId: proj1.id, templateId: tmpl5.id, movementStatus: 'pending' },
      ],
    });
    // proj2: 初回訪問のみ
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj2.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-03') },
        { projectId: proj2.id, templateId: tmpl2.id, movementStatus: 'pending' },
        { projectId: proj2.id, templateId: tmpl3.id, movementStatus: 'pending' },
        { projectId: proj2.id, templateId: tmpl4.id, movementStatus: 'pending' },
        { projectId: proj2.id, templateId: tmpl5.id, movementStatus: 'pending' },
      ],
    });
    // proj3: 交渉中（4ステップ完了）
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj3.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-05') },
        { projectId: proj3.id, templateId: tmpl2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-12') },
        { projectId: proj3.id, templateId: tmpl3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-18') },
        { projectId: proj3.id, templateId: tmpl4.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-20') },
        { projectId: proj3.id, templateId: tmpl5.id, movementStatus: 'pending' },
      ],
    });
    // proj4: 初回訪問のみ
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj4.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-18') },
        { projectId: proj4.id, templateId: tmpl2.id, movementStatus: 'pending' },
        { projectId: proj4.id, templateId: tmpl3.id, movementStatus: 'pending' },
        { projectId: proj4.id, templateId: tmpl4.id, movementStatus: 'pending' },
        { projectId: proj4.id, templateId: tmpl5.id, movementStatus: 'pending' },
      ],
    });
    // proj5: 見積提出まで完了
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj5.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-10') },
        { projectId: proj5.id, templateId: tmpl2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-15') },
        { projectId: proj5.id, templateId: tmpl3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-20') },
        { projectId: proj5.id, templateId: tmpl4.id, movementStatus: 'pending' },
        { projectId: proj5.id, templateId: tmpl5.id, movementStatus: 'pending' },
      ],
    });
    // proj6: 受注済み（全完了）
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj6.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-05') },
        { projectId: proj6.id, templateId: tmpl2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-10') },
        { projectId: proj6.id, templateId: tmpl3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-15') },
        { projectId: proj6.id, templateId: tmpl4.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-25') },
        { projectId: proj6.id, templateId: tmpl5.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-30') },
      ],
    });
    // proj7: 失注（3ステップまで）
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj7.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2025-12-20') },
        { projectId: proj7.id, templateId: tmpl2.id, movementStatus: 'done', movementCompletedAt: new Date('2025-12-28') },
        { projectId: proj7.id, templateId: tmpl3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-05') },
        { projectId: proj7.id, templateId: tmpl4.id, movementStatus: 'pending' },
        { projectId: proj7.id, templateId: tmpl5.id, movementStatus: 'pending' },
      ],
    });
    // proj8: 交渉中（3ステップ完了）
    await tx.projectMovement.createMany({
      data: [
        { projectId: proj8.id, templateId: tmpl1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-15') },
        { projectId: proj8.id, templateId: tmpl2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-22') },
        { projectId: proj8.id, templateId: tmpl3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-28') },
        { projectId: proj8.id, templateId: tmpl4.id, movementStatus: 'pending' },
        { projectId: proj8.id, templateId: tmpl5.id, movementStatus: 'pending' },
      ],
    });

    // ムーブメント（サービスA案件）
    await tx.projectMovement.createMany({
      data: [
        { projectId: projB1.id, templateId: tmplB1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-05') },
        { projectId: projB1.id, templateId: tmplB2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-08') },
        { projectId: projB1.id, templateId: tmplB3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-10') },
        { projectId: projB1.id, templateId: tmplB4.id, movementStatus: 'pending' },

        { projectId: projB2.id, templateId: tmplB1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-15') },
        { projectId: projB2.id, templateId: tmplB2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-20') },
        { projectId: projB2.id, templateId: tmplB3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-02-25') },
        { projectId: projB2.id, templateId: tmplB4.id, movementStatus: 'pending' },

        { projectId: projB3.id, templateId: tmplB1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-03-05') },
        { projectId: projB3.id, templateId: tmplB2.id, movementStatus: 'pending' },
        { projectId: projB3.id, templateId: tmplB3.id, movementStatus: 'pending' },
        { projectId: projB3.id, templateId: tmplB4.id, movementStatus: 'pending' },

        { projectId: projB4.id, templateId: tmplB1.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-05') },
        { projectId: projB4.id, templateId: tmplB2.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-10') },
        { projectId: projB4.id, templateId: tmplB3.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-15') },
        { projectId: projB4.id, templateId: tmplB4.id, movementStatus: 'done', movementCompletedAt: new Date('2026-01-20') },
      ],
    });

    // ============================================
    // 19. 売上目標（SalesTarget）
    // ============================================
    const months2026 = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
    const revenueTargetsA = [2000000, 2500000, 3000000, 3500000, 4000000, 3000000, 2500000, 2000000, 3000000, 3500000, 4000000, 5000000];
    const unitTargetsA = [4, 5, 6, 7, 8, 6, 5, 4, 6, 7, 8, 10];
    const revenueTargetsB = [500000, 600000, 700000, 800000, 900000, 1000000, 800000, 700000, 800000, 900000, 1000000, 1200000];

    for (let i = 0; i < 12; i++) {
      await tx.salesTarget.create({
        data: { businessId: businessA.id, targetMonth: months2026[i], targetAmount: revenueTargetsA[i], kpiKey: 'revenue', createdBy: admin.id, updatedBy: admin.id },
      });
      await tx.salesTarget.create({
        data: { businessId: businessA.id, targetMonth: months2026[i], targetAmount: unitTargetsA[i], kpiKey: 'units', createdBy: admin.id, updatedBy: admin.id },
      });
      await tx.salesTarget.create({
        data: { businessId: businessB.id, targetMonth: months2026[i], targetAmount: revenueTargetsB[i], kpiKey: 'revenue', createdBy: admin.id, updatedBy: admin.id },
      });
    }

    // ============================================
    // 20. QAカテゴリ＋QAアイテム
    // ============================================
    const qaCat1 = await tx.qaCategory.create({ data: { categoryName: 'システム利用方法', categorySortOrder: 1, createdBy: admin.id } });
    const qaCat2 = await tx.qaCategory.create({ data: { categoryName: '営業関連', categorySortOrder: 2, createdBy: admin.id } });
    const qaCat3 = await tx.qaCategory.create({ data: { categoryName: '代理店関連', categorySortOrder: 3, createdBy: admin.id } });
    await tx.qaCategory.createMany({
      data: [
        { categoryName: '契約・手続き', categorySortOrder: 4, createdBy: admin.id },
        { categoryName: 'トラブルシューティング', categorySortOrder: 5, createdBy: admin.id },
        { categoryName: 'その他', categorySortOrder: 6, createdBy: admin.id },
      ],
    });

    await tx.qaItem.createMany({
      data: [
        { categoryId: qaCat1.id, businessId: null, itemTitle: 'ログイン方法', itemQuestion: 'システムにログインする方法を教えてください。', itemAnswer: 'ブラウザからログインページにアクセスし、メールアドレスとパスワードを入力してログインしてください。', itemStatus: 'published', itemIsPublic: true, itemSortOrder: 1, createdBy: admin.id },
        { categoryId: qaCat1.id, businessId: null, itemTitle: 'パスワードの変更', itemQuestion: 'パスワードを変更したいです。', itemAnswer: '管理者にパスワード変更を依頼してください。', itemStatus: 'published', itemIsPublic: true, itemSortOrder: 2, createdBy: admin.id },
        { categoryId: qaCat2.id, businessId: businessA.id, itemTitle: '見積書の作成方法', itemQuestion: 'MOAG事業の見積書はどうやって作成しますか？', itemAnswer: '契約マスタの案件詳細画面から、ファイルタブに見積書をアップロードしてください。', itemStatus: 'published', itemIsPublic: true, itemSortOrder: 1, createdBy: admin.id },
        { categoryId: qaCat3.id, businessId: null, itemTitle: '代理店ポータルの使い方', itemQuestion: '代理店ポータルではどのような操作ができますか？', itemAnswer: '代理店ポータルでは、担当案件の閲覧、ムーブメントの進捗確認、資料のダウンロードが可能です。', itemStatus: 'published', itemIsPublic: true, itemSortOrder: 1, createdBy: admin.id },
      ],
    });

    // ============================================
    // 21. お知らせ（Announcement）
    // ============================================
    await tx.announcement.createMany({
      data: [
        {
          businessId: null, title: 'システムメンテナンスのお知らせ',
          content: '3月20日（金）22:00〜翌3:00にシステムメンテナンスを実施します。この間、システムの利用ができなくなります。ご迷惑をおかけしますが、ご了承ください。',
          priority: 'high', targetScope: 'all',
          publishedAt: new Date('2026-03-15'), expiresAt: new Date('2026-03-21'),
          createdBy: admin.id,
        },
        {
          businessId: businessA.id, title: 'MOAG事業 4月キャンペーン開始',
          content: '4月1日より省エネ機器導入キャンペーンを開始します。期間中は特別価格でのご提供となります。詳細は営業部までお問い合わせください。',
          priority: 'normal', targetScope: 'all',
          publishedAt: new Date('2026-03-10'),
          createdBy: admin.id,
        },
        {
          businessId: null, title: '代理店向け：新機能リリースのお知らせ',
          content: '案件ムーブメント画面に検索・フィルター機能を追加しました。ご活用ください。',
          priority: 'normal', targetScope: 'partner',
          publishedAt: new Date('2026-03-01'),
          createdBy: admin.id,
        },
      ],
    });

    // ============================================
    // 22. コメント
    // ============================================
    await tx.projectComment.createMany({
      data: [
        { projectId: proj1.id, commentText: '初回訪問完了。省エネニーズが強く、補助金活用を検討中。', createdBy: staff1.id },
        { projectId: proj1.id, commentText: '見積を提出しました。来週回答予定。', createdBy: staff1.id },
        { projectId: proj3.id, commentText: '工場長と面談。導入台数を増やす方向で再見積予定。', createdBy: admin.id },
        { projectId: proj6.id, commentText: '受注確定。納品日は3/10で調整中。', createdBy: admin.id },
        { projectId: projB1.id, commentText: 'プレミアムプランで提案。デモ好評。', createdBy: admin.id },
      ],
    });

    // ============================================
    // 23. リマインダー
    // ============================================
    await tx.projectReminder.createMany({
      data: [
        { projectId: proj1.id, assignedTo: staff1.id, reminderDate: new Date('2026-03-20'), title: '回答フォロー', description: '見積提出後の回答をフォローする', notifyEmail: true, createdBy: admin.id },
        { projectId: proj3.id, assignedTo: admin.id, reminderDate: new Date('2026-03-25'), title: '再見積提出', description: '台数増の再見積を提出する', notifyEmail: true, createdBy: admin.id },
        { projectId: proj6.id, assignedTo: admin.id, reminderDate: new Date('2026-03-10'), title: '納品確認', description: '納品日の最終確認', notifyEmail: false, isCompleted: true, completedAt: new Date('2026-03-09'), createdBy: admin.id },
      ],
    });

    // ============================================
    // 24. 通知
    // ============================================
    await tx.notification.createMany({
      data: [
        { userId: staff1.id, notificationType: 'reminder', notificationTitle: 'リマインダー: 回答フォロー', notificationMessage: 'MG-0001 の回答フォロー期限が近づいています。', isRead: false, relatedEntity: 'project', relatedEntityId: proj1.id },
        { userId: admin.id, notificationType: 'status_change', notificationTitle: '営業ステータス変更', notificationMessage: 'MG-0006 のステータスが「受注」に変更されました。', isRead: true, relatedEntity: 'project', relatedEntityId: proj6.id },
        { userId: partnerAdminUser.id, notificationType: 'document', notificationTitle: '新しい資料が公開されました', notificationMessage: 'MOAG事業の資料が更新されました。ポータルからご確認ください。', isRead: false },
        { userId: staff1.id, notificationType: 'announcement', notificationTitle: 'システムメンテナンスのお知らせ', notificationMessage: '3月20日にシステムメンテナンスを実施します。', isRead: false },
      ],
    });

    // suppress unused variable warnings
    void [staff2, partnerStaffUser, partnerAdmin2User, customer2, customer4, customer5, partner3, partner4, cc2, cc3, cc4, cc5, pc1, pc2, pc3, pc4, pc5, proj2, proj4, proj5, proj7, proj8, projB2, projB3, projB4, qaCat1, qaCat2, qaCat3, tmpl5, tmplB1, tmplB2, tmplB3, tmplB4, industryConstruction, industryRetail];
  });

  console.log('Seeding completed successfully!');
  console.log('');
  console.log('=== ログイン情報 ===');
  console.log('管理者:       admin@example.com / admin123');
  console.log('スタッフ1:    staff@example.com / staff123');
  console.log('スタッフ2:    staff2@example.com / staff456');
  console.log('代理店管理者: partner-admin@example.com / partner123');
  console.log('代理店スタッフ: partner-staff@example.com / partner123');
  console.log('代理店管理者2: partner-admin2@example.com / partner123');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
