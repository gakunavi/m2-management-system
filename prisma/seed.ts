import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log('Seeding database...');

  // 既存データをクリア + シーケンスリセット（IDが1から採番される）
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      inquiry_attachments,
      inquiries,
      qa_attachments,
      qa_items,
      qa_categories,
      project_files,
      project_movements,
      projects,
      movement_templates,
      business_status_definitions,
      customer_contact_business_links,
      customer_contacts,
      customer_business_links,
      customers,
      partner_contact_business_links,
      partner_contacts,
      partner_bank_accounts,
      partners,
      user_business_assignments,
      user_table_preferences,
      users,
      businesses,
      industries
    RESTART IDENTITY CASCADE
  `);

  // トランザクションでアトミックに実行
  await prisma.$transaction(async (tx) => {

    // 0. 業種マスタ
    const industryIT = await tx.industry.create({
      data: { industryName: 'IT・ソフトウェア', displayOrder: 1 },
    });
    const industryConsulting = await tx.industry.create({
      data: { industryName: 'コンサルティング', displayOrder: 2 },
    });
    const industryManufacturing = await tx.industry.create({
      data: { industryName: '製造業', displayOrder: 3 },
    });
    await tx.industry.createMany({
      data: [
        { industryName: '建設・不動産', displayOrder: 4 },
        { industryName: '小売・卸売', displayOrder: 5 },
        { industryName: '金融・保険', displayOrder: 6 },
        { industryName: '医療・福祉', displayOrder: 7 },
        { industryName: '教育・研究', displayOrder: 8 },
        { industryName: '運輸・物流', displayOrder: 9 },
        { industryName: 'その他', displayOrder: 99 },
      ],
    });

    // 1. 事業マスタ
    const businessA = await tx.business.create({
      data: {
        businessCode: 'moag',
        businessName: 'MOAG事業',
        businessDescription: 'MOAG（省エネ機器）の営業管理',
        businessProjectPrefix: 'MG',
        businessConfig: {
          projectFields: [
            {
              key: 'proposed_amount',
              label: '提案金額',
              type: 'number',
              required: false,
              description: '提案金額（税抜）を入力してください',
              sortOrder: 1,
            },
            {
              key: 'installation_site',
              label: '設置場所',
              type: 'text',
              required: false,
              description: '機器の設置場所・施設名を入力してください',
              sortOrder: 2,
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
        },
        businessSortOrder: 1,
      },
    });

    const businessB = await tx.business.create({
      data: {
        businessCode: 'service_a',
        businessName: 'サービスA事業',
        businessDescription: 'サービスAの営業管理',
        businessProjectPrefix: 'SA',
        businessConfig: {},
        businessSortOrder: 2,
      },
    });

    // 2. ユーザー
    const [adminHash, staffHash, partnerHash] = await Promise.all([
      bcrypt.hash('admin123', SALT_ROUNDS),
      bcrypt.hash('staff123', SALT_ROUNDS),
      bcrypt.hash('partner123', SALT_ROUNDS),
    ]);

    const admin = await tx.user.create({
      data: {
        userEmail: 'admin@example.com',
        userPasswordHash: adminHash,
        userPasswordPlain: 'admin123',
        userName: '管理者',
        userRole: 'admin',
      },
    });

    const staff = await tx.user.create({
      data: {
        userEmail: 'staff@example.com',
        userPasswordHash: staffHash,
        userPasswordPlain: 'staff123',
        userName: '担当者',
        userRole: 'staff',
        createdBy: admin.id,
      },
    });

    const partnerAdminUser = await tx.user.create({
      data: {
        userEmail: 'partner-admin@example.com',
        userPasswordHash: partnerHash,
        userPasswordPlain: 'partner123',
        userName: '代理店管理者',
        userRole: 'partner_admin',
        createdBy: admin.id,
      },
    });

    const partnerStaffUser = await tx.user.create({
      data: {
        userEmail: 'partner-staff@example.com',
        userPasswordHash: partnerHash,
        userPasswordPlain: 'partner123',
        userName: '代理店スタッフ',
        userRole: 'partner_staff',
        createdBy: admin.id,
      },
    });

    // 3. 事業割り当て
    await tx.userBusinessAssignment.createMany({
      data: [
        { userId: admin.id, businessId: businessA.id, assignmentRole: 'admin' },
        { userId: admin.id, businessId: businessB.id, assignmentRole: 'admin' },
        { userId: staff.id, businessId: businessA.id, assignmentRole: 'member' },
      ],
    });

    // 4. 顧客マスタ
    const customer1 = await tx.customer.create({
      data: {
        customerCode: 'CST-0001',
        customerName: '株式会社テストA',
        customerSalutation: '株式会社テストA 御中',
        customerType: '法人',
        customerPostalCode: '100-0001',
        customerAddress: '東京都千代田区千代田1-1-1',
        customerPhone: '03-1234-5678',
        customerFax: '03-1234-5679',
        customerEmail: 'info@test-a.example.com',
        customerWebsite: 'https://test-a.example.com',
        industryId: industryIT.id,
        customerCorporateNumber: '1234567890123',
        customerInvoiceNumber: 'T1234567890123',
        customerCapital: BigInt(10_000_000),
        customerEstablishedDate: new Date('2010-04-01'),
        customerNotes: 'テスト顧客データA',
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
        customerNotes: 'テスト顧客データB',
        createdBy: admin.id,
      },
    });

    const customer3 = await tx.customer.create({
      data: {
        customerCode: 'CST-0003',
        customerName: '合同会社サンプルC',
        customerSalutation: '合同会社サンプルC 御中',
        customerType: '法人',
        customerPostalCode: '460-0001',
        customerAddress: '愛知県名古屋市中区栄1-1-1',
        customerPhone: '052-111-2222',
        industryId: industryManufacturing.id,
        createdBy: staff.id,
      },
    });

    // 5. 顧客-事業リンク
    await tx.customerBusinessLink.createMany({
      data: [
        { customerId: customer1.id, businessId: businessA.id, linkStatus: 'active' },
        { customerId: customer1.id, businessId: businessB.id, linkStatus: 'active' },
        { customerId: customer2.id, businessId: businessA.id, linkStatus: 'active' },
        { customerId: customer3.id, businessId: businessB.id, linkStatus: 'active' },
      ],
    });

    // 6. 顧客担当者
    const contact1 = await tx.customerContact.create({
      data: {
        customerId: customer1.id,
        contactName: '山田 花子',
        contactDepartment: '営業部',
        contactPosition: '部長',
        contactIsRepresentative: true,
        contactPhone: '03-1234-5678',
        contactFax: '03-1234-5679',
        contactEmail: 'yamada@test-a.example.com',
        contactIsPrimary: true,
        contactSortOrder: 0,
      },
    });

    const contact2 = await tx.customerContact.create({
      data: {
        customerId: customer1.id,
        contactName: '鈴木 次郎',
        contactDepartment: '経営企画部',
        contactPosition: '課長',
        contactIsRepresentative: false,
        contactPhone: '03-1234-5680',
        contactEmail: 'suzuki@test-a.example.com',
        contactIsPrimary: false,
        contactSortOrder: 1,
      },
    });

    const contact3 = await tx.customerContact.create({
      data: {
        customerId: customer2.id,
        contactName: '田中 太郎',
        contactIsRepresentative: true,
        contactPhone: '06-9876-5432',
        contactEmail: 'tanaka@example.com',
        contactIsPrimary: true,
        contactSortOrder: 0,
      },
    });

    // 7. 担当者-事業リンク
    await tx.customerContactBusinessLink.createMany({
      data: [
        { contactId: contact1.id, businessId: businessA.id },
        { contactId: contact1.id, businessId: businessB.id },
        { contactId: contact2.id, businessId: businessA.id },
        { contactId: contact3.id, businessId: businessA.id },
      ],
    });

    // 8. 代理店マスタ
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
        partnerNotes: '主要1次代理店。MOAG・サービスA両方対応。',
        createdBy: admin.id,
      },
    });

    // パートナーユーザーを代理店に紐づけ
    await tx.user.update({
      where: { id: partnerAdminUser.id },
      data: { userPartnerId: partner1.id },
    });
    await tx.user.update({
      where: { id: partnerStaffUser.id },
      data: { userPartnerId: partner1.id },
    });

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
        createdBy: staff.id,
      },
    });

    // 9. 代理店担当者
    const partnerContact1 = await tx.partnerContact.create({
      data: {
        partnerId: partner1.id,
        contactName: '佐藤 一郎',
        contactDepartment: '営業部',
        contactPosition: '代表取締役',
        contactIsRepresentative: true,
        contactPhone: '03-5555-1111',
        contactEmail: 'sato@ace-partner.example.com',
        contactIsPrimary: false,
        contactSortOrder: 0,
      },
    });

    const partnerContact2 = await tx.partnerContact.create({
      data: {
        partnerId: partner1.id,
        contactName: '中村 美咲',
        contactDepartment: '営業部',
        contactPosition: '営業マネージャー',
        contactIsRepresentative: false,
        contactPhone: '03-5555-1113',
        contactEmail: 'nakamura@ace-partner.example.com',
        contactIsPrimary: true,
        contactSortOrder: 1,
      },
    });

    const partnerContact3 = await tx.partnerContact.create({
      data: {
        partnerId: partner2.id,
        contactName: '木村 浩二',
        contactPosition: '代表社員',
        contactIsRepresentative: true,
        contactPhone: '06-6666-2222',
        contactEmail: 'kimura@visionpro.example.com',
        contactIsPrimary: true,
        contactSortOrder: 0,
      },
    });

    const partnerContact4 = await tx.partnerContact.create({
      data: {
        partnerId: partner3.id,
        contactName: '田村 健一',
        contactIsRepresentative: true,
        contactPhone: '052-222-3333',
        contactEmail: 'tamura@example.com',
        contactIsPrimary: true,
        contactSortOrder: 0,
      },
    });

    // 10. 代理店担当者-事業リンク
    await tx.partnerContactBusinessLink.createMany({
      data: [
        { contactId: partnerContact1.id, businessId: businessA.id },
        { contactId: partnerContact1.id, businessId: businessB.id },
        { contactId: partnerContact2.id, businessId: businessA.id },
        { contactId: partnerContact2.id, businessId: businessB.id },
        { contactId: partnerContact3.id, businessId: businessA.id },
        { contactId: partnerContact4.id, businessId: businessA.id },
      ],
    });

    // 11. 代理店口座情報
    // AG-0001: デフォルト口座 + MOAG事業専用口座
    await tx.partnerBankAccount.create({
      data: {
        partnerId: partner1.id,
        businessId: null, // デフォルト（全事業共通）
        bankName: '三菱UFJ銀行',
        branchName: '渋谷支店',
        accountType: '普通',
        accountNumber: '1234567',
        accountHolder: 'カブシキガイシャエースパートナー',
      },
    });

    await tx.partnerBankAccount.create({
      data: {
        partnerId: partner1.id,
        businessId: businessA.id, // MOAG事業専用
        bankName: 'みずほ銀行',
        branchName: '新宿支店',
        accountType: '当座',
        accountNumber: '7654321',
        accountHolder: 'カブシキガイシャエースパートナー',
      },
    });

    // AG-0002: デフォルト口座のみ
    await tx.partnerBankAccount.create({
      data: {
        partnerId: partner2.id,
        businessId: null,
        bankName: '大阪信用金庫',
        branchName: '梅田支店',
        accountType: '普通',
        accountNumber: '9876543',
        accountHolder: 'ゴウドウガイシャビジョンプロ',
      },
    });

    // 11. 営業ステータス定義（MOAG事業）
    const statusYomi = await tx.businessStatusDefinition.create({
      data: {
        businessId: businessA.id,
        statusCode: 'yomi',
        statusLabel: '予見',
        statusPriority: 10,
        statusColor: '#94a3b8',
        statusIsFinal: false,
        statusIsLost: false,
        statusSortOrder: 1,
      },
    });
    const statusQuote = await tx.businessStatusDefinition.create({
      data: {
        businessId: businessA.id,
        statusCode: 'quote',
        statusLabel: '見積提出',
        statusPriority: 30,
        statusColor: '#3b82f6',
        statusIsFinal: false,
        statusIsLost: false,
        statusSortOrder: 2,
      },
    });
    const statusNego = await tx.businessStatusDefinition.create({
      data: {
        businessId: businessA.id,
        statusCode: 'nego',
        statusLabel: '交渉中',
        statusPriority: 50,
        statusColor: '#f59e0b',
        statusIsFinal: false,
        statusIsLost: false,
        statusSortOrder: 3,
      },
    });
    const statusWon = await tx.businessStatusDefinition.create({
      data: {
        businessId: businessA.id,
        statusCode: 'won',
        statusLabel: '受注',
        statusPriority: 90,
        statusColor: '#22c55e',
        statusIsFinal: true,
        statusIsLost: false,
        statusSortOrder: 4,
      },
    });
    const statusLost = await tx.businessStatusDefinition.create({
      data: {
        businessId: businessA.id,
        statusCode: 'lost',
        statusLabel: '失注',
        statusPriority: 10,
        statusColor: '#ef4444',
        statusIsFinal: true,
        statusIsLost: true,
        statusSortOrder: 5,
      },
    });

    // 12. 営業ステータス定義（サービスA事業）
    const statusSaLead = await tx.businessStatusDefinition.create({
      data: {
        businessId: businessB.id,
        statusCode: 'lead',
        statusLabel: 'リード',
        statusPriority: 10,
        statusColor: '#94a3b8',
        statusIsFinal: false,
        statusIsLost: false,
        statusSortOrder: 1,
      },
    });
    const statusSaProposal = await tx.businessStatusDefinition.create({
      data: {
        businessId: businessB.id,
        statusCode: 'proposal',
        statusLabel: '提案中',
        statusPriority: 40,
        statusColor: '#8b5cf6',
        statusIsFinal: false,
        statusIsLost: false,
        statusSortOrder: 2,
      },
    });
    await tx.businessStatusDefinition.create({
      data: {
        businessId: businessB.id,
        statusCode: 'contract',
        statusLabel: '契約済',
        statusPriority: 90,
        statusColor: '#22c55e',
        statusIsFinal: true,
        statusIsLost: false,
        statusSortOrder: 3,
      },
    });

    // 13. ムーブメントテンプレート（MOAG事業）
    const tmpl1 = await tx.movementTemplate.create({
      data: {
        businessId: businessA.id,
        stepNumber: 1,
        stepCode: 'initial_visit',
        stepName: '初回訪問',
        stepDescription: '顧客への初回訪問・ヒアリング',
        stepIsSalesLinked: false,
        stepLinkedStatusCode: null,
      },
    });
    const tmpl2 = await tx.movementTemplate.create({
      data: {
        businessId: businessA.id,
        stepNumber: 2,
        stepCode: 'site_survey',
        stepName: '現地調査',
        stepDescription: '設置場所の現地調査・計測',
        stepIsSalesLinked: false,
        stepLinkedStatusCode: null,
      },
    });
    const tmpl3 = await tx.movementTemplate.create({
      data: {
        businessId: businessA.id,
        stepNumber: 3,
        stepCode: 'quote_submission',
        stepName: '見積提出',
        stepDescription: '見積書の提出',
        stepIsSalesLinked: true,
        stepLinkedStatusCode: 'quote',
      },
    });
    const tmpl4 = await tx.movementTemplate.create({
      data: {
        businessId: businessA.id,
        stepNumber: 4,
        stepCode: 'negotiation',
        stepName: '交渉・調整',
        stepDescription: '価格交渉・仕様調整',
        stepIsSalesLinked: true,
        stepLinkedStatusCode: 'nego',
      },
    });
    await tx.movementTemplate.create({
      data: {
        businessId: businessA.id,
        stepNumber: 5,
        stepCode: 'order_receipt',
        stepName: '受注確定',
        stepDescription: '発注書受領・受注確定',
        stepIsSalesLinked: true,
        stepLinkedStatusCode: 'won',
      },
    });

    // 14. 案件データ（MOAG事業）
    const project1 = await tx.project.create({
      data: {
        businessId: businessA.id,
        customerId: customer1.id,
        partnerId: partner1.id,
        projectNo: 'MG-0001',
        projectSalesStatus: 'quote',
        projectStatusChangedAt: new Date('2026-01-15'),
        projectExpectedCloseMonth: '2026-03',
        projectAssignedUserId: staff.id,
        projectAssignedUserName: '山田花子',
        projectNotes: '省エネ機器の導入提案。3月中の受注を目標。',
        projectCustomData: {
          proposed_amount: 1500000,
          installation_site: '本社1Fロビー',
        },
        createdBy: admin.id,
        updatedBy: staff.id,
      },
    });

    const project2 = await tx.project.create({
      data: {
        businessId: businessA.id,
        customerId: customer2.id,
        partnerId: null,
        projectNo: 'MG-0002',
        projectSalesStatus: 'yomi',
        projectStatusChangedAt: new Date('2026-02-01'),
        projectExpectedCloseMonth: '2026-06',
        projectAssignedUserId: staff.id,
        projectAssignedUserName: '山田花子',
        projectCustomData: {
          proposed_amount: 800000,
          installation_site: '事務所',
        },
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    });

    const project3 = await tx.project.create({
      data: {
        businessId: businessA.id,
        customerId: customer3.id,
        partnerId: partner2.id,
        projectNo: 'MG-0003',
        projectSalesStatus: 'nego',
        projectStatusChangedAt: new Date('2026-01-20'),
        projectExpectedCloseMonth: '2026-04',
        projectAssignedUserId: admin.id,
        projectAssignedUserName: '管理太郎',
        projectNotes: '工場への大型導入案件。',
        projectCustomData: {
          proposed_amount: 5000000,
          installation_site: '第一工場',
        },
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    });

    // 15. 案件データ（サービスA事業）
    const project4 = await tx.project.create({
      data: {
        businessId: businessB.id,
        customerId: customer1.id,
        partnerId: partner1.id,
        projectNo: 'SA-0001',
        projectSalesStatus: 'proposal',
        projectStatusChangedAt: new Date('2026-02-10'),
        projectExpectedCloseMonth: '2026-05',
        projectAssignedUserId: admin.id,
        projectAssignedUserName: '管理太郎',
        projectCustomData: {},
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    });

    // 16. ムーブメントデータ（案件1: 見積提出まで完了）
    await tx.projectMovement.createMany({
      data: [
        {
          projectId: project1.id,
          templateId: tmpl1.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-01-10'),
          movementNotes: '担当：山田花子',
        },
        {
          projectId: project1.id,
          templateId: tmpl2.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-01-13'),
          movementNotes: '設置スペース確認済み',
        },
        {
          projectId: project1.id,
          templateId: tmpl3.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-01-15'),
        },
        {
          projectId: project1.id,
          templateId: tmpl4.id,
          movementStatus: 'pending',
        },
      ],
    });

    // 案件2: 初回訪問のみ完了
    await tx.projectMovement.createMany({
      data: [
        {
          projectId: project2.id,
          templateId: tmpl1.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-02-03'),
        },
        {
          projectId: project2.id,
          templateId: tmpl2.id,
          movementStatus: 'pending',
        },
        {
          projectId: project2.id,
          templateId: tmpl3.id,
          movementStatus: 'pending',
        },
        {
          projectId: project2.id,
          templateId: tmpl4.id,
          movementStatus: 'pending',
        },
      ],
    });

    // 案件3: 交渉中（全ステップ pending でよい。初回-現地-見積は skip）
    await tx.projectMovement.createMany({
      data: [
        {
          projectId: project3.id,
          templateId: tmpl1.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-01-05'),
        },
        {
          projectId: project3.id,
          templateId: tmpl2.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-01-12'),
        },
        {
          projectId: project3.id,
          templateId: tmpl3.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-01-18'),
        },
        {
          projectId: project3.id,
          templateId: tmpl4.id,
          movementStatus: 'done',
          movementCompletedAt: new Date('2026-01-20'),
        },
      ],
    });

    // 案件4はサービスA（テンプレートなし）なのでムーブメント不要

    // ============================================
    // QAカテゴリ（Phase 5B）
    // ============================================

    await tx.qaCategory.createMany({
      data: [
        { categoryName: 'システム利用方法', categorySortOrder: 1, createdBy: admin.id },
        { categoryName: '営業関連', categorySortOrder: 2, createdBy: admin.id },
        { categoryName: '代理店関連', categorySortOrder: 3, createdBy: admin.id },
        { categoryName: '契約・手続き', categorySortOrder: 4, createdBy: admin.id },
        { categoryName: 'トラブルシューティング', categorySortOrder: 5, createdBy: admin.id },
        { categoryName: 'その他', categorySortOrder: 6, createdBy: admin.id },
      ],
    });

    // suppress unused variable warnings
    void [statusYomi, statusQuote, statusNego, statusWon, statusLost, statusSaLead, statusSaProposal, project1, project2, project3, project4, tmpl1, tmpl2, tmpl3, tmpl4, partnerContact1, partnerContact2, partnerContact3, partnerContact4, contact1, contact2, contact3];
  });

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
