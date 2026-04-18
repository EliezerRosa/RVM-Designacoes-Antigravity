export interface PostResponseActionItem {
    id: string;
    label: string;
    onClick: () => void;
    variant?: 'default' | 'primary' | 'subtle';
}

interface PostResponseActionsProps {
    actions: PostResponseActionItem[];
}

export function PostResponseActions({ actions }: PostResponseActionsProps) {
    if (actions.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '4px 4px 12px 4px',
            marginLeft: '4px'
        }}>
            {actions.map(action => {
                const style = action.variant === 'primary'
                    ? {
                        background: '#EEF2FF',
                        border: '1px solid #C7D2FE',
                        color: '#3730A3'
                    }
                    : action.variant === 'subtle'
                        ? {
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            color: '#475569'
                        }
                        : {
                            background: '#FFFFFF',
                            border: '1px solid #D1D5DB',
                            color: '#374151'
                        };

                return (
                    <button
                        key={action.id}
                        onClick={action.onClick}
                        style={{
                            padding: '6px 10px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            ...style
                        }}
                    >
                        {action.label}
                    </button>
                );
            })}
        </div>
    );
}