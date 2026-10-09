import davidPortrait from '../assets/leaders/david-eby.jpg';
import lornePortrait from '../assets/leaders/lorne-doerkson.jpg';
import emilyPortrait from '../assets/leaders/emily-lowan.jpg';

// Reviewed summaries of official 2026 campaign sources, separate from raw
// collector output. Recheck leaders and promises before changing this date.
export const reviewedOn = 'October 8, 2026';
export const parties = [
    {
        id: 'ndp',
        portrait: davidPortrait,
        portraitSource: 'https://www.bcndp.ca/about-david',
        portraitPosition: '60% center',
        name: 'BC NDP',
        color: '#c85316',
        leader: 'David Eby',
        leaderSource:
            'https://www.bcndp.ca/releases/david-eby-launches-election-plan-build-bc-strong-amid-trumps-attacks',
        leaderNote: 'Incumbent premier',
        platform:
            'https://www.bcndp.ca/releases/david-eby-launches-election-plan-build-bc-strong-amid-trumps-attacks',
        status: 'Campaign launch priorities; further details are being announced.',
        promises: [
            [
                'Economy',
                'Support workers and businesses affected by tariffs and expand trade into markets beyond the United States.',
            ],
            [
                'Affordability',
                'Keep family costs down and build the housing and infrastructure BC needs.',
            ],
            [
                'Health care',
                'Recruit more health workers and strengthen health care and public services.',
            ],
            [
                'Canadian trade',
                'Choose Canadian goods where possible and maintain the US alcohol ban until a fair deal for forest workers.',
            ],
        ],
    },
    {
        id: 'conservative',
        portrait: lornePortrait,
        portraitSource: 'https://conservativebc.ca/candidate/lorne-doerkson/',
        portraitPosition: 'center 25%',
        name: 'Conservative Party of BC',
        color: '#245b8a',
        leader: 'Lorne Doerkson',
        leaderSource: 'https://conservativebc.ca/candidate/lorne-doerkson/',
        leaderNote: 'Party leader',
        platform: 'https://conservativebc.ca/plan/',
        status: 'Selected commitments from the party’s campaign plan.',
        promises: [
            [
                'Taxes',
                'Raise the personal income tax exemption to $32,000 and pledge no tax increases during its term.',
            ],
            [
                'Health care',
                'Maintain health spending and invest in doctors and nurses to keep emergency rooms and maternity wards open.',
            ],
            [
                'Energy',
                'Expand natural gas and LNG production, with growth targets for 2032 and 2035.',
            ],
            [
                'Indigenous policy',
                'Repeal the Declaration on the Rights of Indigenous Peoples Act (DRIPA).',
            ],
        ],
    },
    {
        id: 'green',
        portrait: emilyPortrait,
        portraitSource: 'https://bcgreens.ca/emily-lowan-leader/',
        portraitPosition: 'center 30%',
        name: 'BC Green Party',
        color: '#38634b',
        leader: 'Emily Lowan',
        leaderSource: 'https://bcgreens.ca/emily-lowan-leader/',
        leaderNote: 'Party leader',
        platform: 'https://bcgreens.ca/our-plan/',
        status: 'Published priorities; the party says its full platform is coming soon.',
        promises: [
            [
                'Housing',
                'Build and protect 26,000 permanently affordable non-market homes annually and limit rent increases between tenants.',
            ],
            ['Transit', 'Make public transit frequent, fast and free.'],
            [
                'Health care',
                'Build community health centres in every region and cover mental health care through the public system.',
            ],
            [
                'Climate & democracy',
                'Stop new fossil fuel development and introduce proportional representation legislation within the first 100 days.',
            ],
        ],
    },
];

// Leaders verified against Elections BC's October 8, 2026 register.
export const partyLeaderSource =
    'https://elections.bc.ca/docs/fin/Registered-Political-Parties-Information.pdf';
export const otherParties = [
    {
        id: 'centre',
        name: 'CentreBC',
        color: '#65518b',
        leader: 'Elenore Sturko',
        platform: 'https://www.centrebc.ca/our-policy/',
        status: 'Platform in development. The party lists affordability, health care, economic growth, fiscal responsibility, sustainability and Indigenous relations as policy areas, but has not published specific commitments on this page.',
    },
    {
        id: 'chp',
        name: 'Christian Heritage Party of BC',
        color: '#315580',
        leader: 'Christian McCay',
        platform: 'https://www.chpbc.ca/platform-priorities/',
        status: 'Selected commitments from the party’s published platform priorities.',
        promises: [
            [
                'Indigenous policy',
                'Repeal DRIPA and replace it with a reconciliation framework that respects constitutional and treaty rights and includes materially affected parties.',
            ],
            [
                'Health care',
                'Direct more resources to frontline care and establish independent oversight of medical assistance in dying.',
            ],
            [
                'Housing',
                'Use suitable public land, long-term leases and faster approvals to lower housing costs.',
            ],
            [
                'Education',
                'Stop using SOGI 123 in schools and focus teaching on core academic subjects and practical skills.',
            ],
            [
                'Addiction',
                'Expand detox, residential treatment and recovery services, with medically overseen involuntary admission when legal criteria are met.',
            ],
        ],
    },
    {
        id: 'communist',
        name: 'Communist Party of BC',
        color: '#a33333',
        leader: 'Robert Crooks',
        platform: 'https://cpcbc.ca/our-platform/',
        status: 'Selected commitments from the party’s 2026 provincial election platform.',
        promises: [
            [
                'Taxes',
                'Eliminate income tax on earnings below $50,000 and increase the contribution from corporations and wealthy taxpayers.',
            ],
            [
                'Housing',
                'Build 100,000 new or renovated public housing units, tie rent controls to units and limit rents to 20% of household income.',
            ],
            [
                'Workers',
                'Raise the minimum wage to $30 with inflation adjustments and reduce the work week to 32 hours without reducing pay.',
            ],
            [
                'Transit',
                'Make public transit free and create an accessible province-wide bus system.',
            ],
            [
                'Climate',
                'End LNG subsidies, cancel Ksi Lisims LNG and support a transition to renewable energy with retraining at union wages.',
            ],
        ],
    },
    {
        id: 'canwest',
        name: 'CanWest Party (CWP)',
        color: '#536473',
        leader: 'Wei Ping Chen',
        platform: 'http://www.canada2.net/',
        status: 'Broad goals from the party’s undated website; no costs or timelines are provided. The site still refers to a 2028 provincial election.',
        promises: [
            ['Economy & taxes', 'Develop the economy and keep taxes low.'],
            [
                'Community',
                'Promote community safety and good relations between neighbours.',
            ],
            [
                'Equality & environment',
                'Support racial equality and a better environment.',
            ],
        ],
    },
    {
        id: 'freedom',
        name: 'Freedom Party of BC',
        color: '#766126',
        leader: 'Amrit Birring',
        platform: 'https://freedompartybc.ca/',
        status: 'Selected positions from the party’s undated website platform; these have not been identified as a newly issued 2026 platform.',
        promises: [
            [
                'Housing',
                'End foreign ownership of BC housing and agricultural land until further notice.',
            ],
            [
                'Education',
                'Remove SOGI 123 and Critical Race Theory from schools and strengthen parental authority over education and medical decisions.',
            ],
            [
                'Health policy',
                'Rehire employees dismissed under COVID policies and repeal Bill 36, the Health Professions and Occupations Act.',
            ],
            [
                'Taxes',
                'Lower taxes and end repeated taxation on used-car sales.',
            ],
            [
                'Resources',
                'Support development of BC’s natural resource industries.',
            ],
        ],
    },
    {
        id: 'libertarian',
        name: 'Libertarian',
        color: '#806822',
        leader: 'Alex Joehl',
        platform: 'https://libertarian.bc.ca/2026-platform/',
        status: 'Selected commitments from the party’s 2026 platform and policy page.',
        promises: [
            [
                'Housing',
                'Simplify development regulations and expand opportunities for housing supply.',
            ],
            ['Insurance', 'End ICBC’s monopoly on basic auto insurance.'],
            [
                'Taxes & spending',
                'Cut government spending, return savings to taxpayers and reduce provincial debt. End PST on private vehicle sales.',
            ],
            [
                'Health care',
                'Allow private surgery options alongside public health care.',
            ],
            [
                'Education',
                'Move decisions toward local school districts and develop a system where funding follows students to parents’ chosen education options.',
            ],
        ],
    },
    {
        id: 'onebc',
        name: 'OneBC',
        color: '#773a44',
        leader: 'Dallas Brodie',
        leaderNote: 'Interim party leader',
        platform: 'https://1bc.ca/priorities',
        status: 'Selected commitments from the party’s published priorities.',
        promises: [
            [
                'Taxes & debt',
                'Cut taxes by 25% in every income bracket, including corporate taxes, reduce PST by 2 percentage points and balance the budget within four years.',
            ],
            [
                'Indigenous policy',
                'Repeal DRIPA, declare UNDRIP without force in BC and halt voluntary transfers of cash, land and resource control to band governments.',
            ],
            [
                'Health care',
                'Allow private care alongside fully funded public care and shift administrative spending toward frontline services.',
            ],
            [
                'Education',
                'Remove SOGI 123, restore standardized testing and introduce a Parental Bill of Rights.',
            ],
            [
                'Housing',
                'Eliminate the Step Code and block municipal rent control programs.',
            ],
            [
                'Addiction',
                'End safer supply and drug consumption programs, convert consumption sites to recovery centres and introduce involuntary rehabilitation for severe addiction.',
            ],
        ],
        note: 'Represented in the legislature; classified as a major party by Elections BC.',
    },
].map((party) => ({
    leaderNote: 'Party leader',
    leaderSource: partyLeaderSource,
    promises: [],
    status: 'Promise summaries have not yet been reviewed.',
    ...party,
}));
export const partyRosterSource =
    'https://elections.bc.ca/2026-provincial-election/candidate-list/';
