import csv, random, datetime

random.seed(42)
names_ar = ['أحمد','محمد','فاطمة','علي','سارة','يوسف','مريم','خالد','ليلى','عمر','نور','زينب','حسن','رنا','طارق']
cities = ['دمشق','حلب','حمص','اللاذقية','حماة','دير الزور','الرقة','إدلب','طرطوس','درعا','Amsterdam','Berlin','Istanbul']
categories = ['إلكترونيات','ملابس','أغذية','أثاث','مستلزمات منزلية','كتب','رياضة','مستحضرات تجميل']
statuses = ['مكتمل','قيد المعالجة','ملغي','معلق']

rows = 60000
with open('big_test_dataset.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['order_id','customer_name','city','category','quantity','unit_price','total_amount','order_date','status','notes','rating'])
    start = datetime.date(2023, 1, 1)
    special_note = 'ملاحظة خاصة تحتوي على فاصلة، واقتباس مزدوج ورموز خاصة !@#%^&*()'
    for i in range(1, rows + 1):
        qty = random.randint(1, 50)
        price = round(random.uniform(5, 2500), 2)
        total = round(qty * price, 2)
        d = start + datetime.timedelta(days=random.randint(0, 1000))
        name = random.choice(names_ar)
        r = random.random()
        if r < 0.05:
            notes = ''
        elif r < 0.07:
            notes = special_note
        else:
            notes = 'طلب رقم ' + str(i) + ' من ' + name
        rating = ''
        if random.random() > 0.1:
            rating = random.choice([1, 2, 3, 4, 5, ''])
        row = [
            i,
            name,
            random.choice(cities),
            random.choice(categories),
            qty if random.random() > 0.01 else '',
            price,
            total,
            d.isoformat(),
            random.choice(statuses),
            notes,
            rating,
        ]
        w.writerow(row)
print('done', rows)
