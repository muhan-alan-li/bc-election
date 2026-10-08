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
            ['Taxes', 'Pledge no tax increases during its term in government.'],
            [
                'Health care',
                'Maintain health spending and invest in doctors and nurses to keep emergency rooms and maternity wards open.',
            ],
            [
                'Energy',
                'Double BC’s LNG production by 2032 and triple it by 2035.',
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
    },
    {
        id: 'chp',
        name: 'Christian Heritage Party of BC',
        color: '#315580',
        leader: 'Christian McCay',
        platform: 'https://www.chpbc.ca/policies/',
    },
    {
        id: 'communist',
        name: 'Communist Party of BC',
        color: '#a33333',
        leader: 'Robert Crooks',
        platform: 'https://cpcbc.ca/our-platform/',
    },
    {
        id: 'canwest',
        name: 'CanWest Party (CWP)',
        color: '#536473',
        leader: 'Wei Ping Chen',
        platform: null,
        note: 'Platform source could not be collected.',
    },
    {
        id: 'freedom',
        name: 'Freedom Party of BC',
        color: '#766126',
        leader: 'Amrit Birring',
        platform: 'https://freedompartybc.ca/',
    },
    {
        id: 'libertarian',
        name: 'Libertarian',
        color: '#806822',
        leader: 'Alex Joehl',
        platform: 'https://libertarian.bc.ca/2026-platform/',
    },
    {
        id: 'onebc',
        name: 'OneBC',
        color: '#773a44',
        leader: 'Dallas Brodie',
        leaderNote: 'Interim party leader',
        platform: 'https://1bc.ca/',
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
