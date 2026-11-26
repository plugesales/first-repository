import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const municipalities = [
    {
      ibgeCode: '3106200',
      name: 'Belo Horizonte',
      state: 'MG',
      providerCode: 'NATIONAL_SEFIN' as const,
      authorizationMode: 'REST_NACIONAL',
      layoutVersion: '1.01',
      homologationUrl: 'https://sefin.producaorestrita.nfse.gov.br/sefinnacional',
      productionUrl: 'https://sefin.nfse.gov.br/sefinnacional',
      environment: 'HOMOLOGATION' as const,
      active: true,
    },
    {
      ibgeCode: '5300108',
      name: 'Brasília',
      state: 'DF',
      providerCode: 'NOTA_CONTROL_DF' as const,
      authorizationMode: 'SOAP_V101',
      layoutVersion: '1.01',
      homologationUrl:
        'https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx',
      productionUrl:
        'https://nfse.fazenda.df.gov.br/wsnfsenacional/nfse.asmx',
      environment: 'HOMOLOGATION' as const,
      active: true,
    },
  ];

  for (const item of municipalities) {
    await prisma.municipality.upsert({
      where: { ibgeCode: item.ibgeCode },
      create: item,
      update: item,
    });
  }

  console.log(
    'Seed concluído: municípios 3106200 (Belo Horizonte/MG - NATIONAL_SEFIN) e 5300108 (Brasília/DF - NOTA_CONTROL_DF) habilitados.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
